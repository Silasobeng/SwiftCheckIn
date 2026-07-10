import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { sendGivingReceipt } from '@/lib/givingReceipt';
import type { Giving, GivingType, PaymentMethod } from '@/types';

export const dynamic = 'force-dynamic';

const GIVING_TYPES: GivingType[] = ['tithe', 'offering', 'seed', 'pledge', 'other'];
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'mobile_money', 'bank_transfer', 'other'];

// GET - List giving records (subscription enforced)
export async function GET(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const givingType = searchParams.get('type');

    let query = supabase
      .from('giving')
      .select('*, person:people(id, full_name, phone)')
      .eq('org_id', auth.session.orgId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (givingType) query = query.eq('giving_type', givingType);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ giving: data });
  } catch (error) {
    console.error('Giving GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Record a new gift (subscription enforced)
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const {
      person_id, giver_name, giver_email, amount, currency,
      giving_type, giving_type_other, payment_method, service_id, notes,
    } = body;

    if (!giver_name?.trim()) {
      return NextResponse.json({ error: 'Giver name is required' }, { status: 400 });
    }

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return NextResponse.json({ error: 'A valid amount greater than 0 is required' }, { status: 400 });
    }

    if (!GIVING_TYPES.includes(giving_type)) {
      return NextResponse.json({ error: 'Invalid giving type' }, { status: 400 });
    }

    if (giving_type === 'other' && !giving_type_other?.trim()) {
      return NextResponse.json({ error: 'Please specify the custom giving type' }, { status: 400 });
    }

    if (payment_method && !PAYMENT_METHODS.includes(payment_method)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
    }

    // If linked to an existing person, verify they belong to this org
    if (person_id) {
      const { data: person, error: personError } = await supabase
        .from('people')
        .select('id')
        .eq('id', person_id)
        .eq('org_id', auth.session.orgId)
        .single();
      if (personError || !person) {
        return NextResponse.json({ error: 'Selected person not found' }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('giving')
      .insert({
        org_id: auth.session.orgId,
        person_id: person_id || null,
        giver_name: giver_name.trim(),
        giver_email: giver_email?.trim() || null,
        amount: numericAmount,
        currency: currency?.trim() || 'GHS',
        giving_type,
        giving_type_other: giving_type === 'other' ? giving_type_other.trim() : null,
        payment_method: payment_method || 'cash',
        service_id: service_id || null,
        notes: notes?.trim() || null,
        status: 'recorded',
      })
      .select('*, person:people(id, full_name, phone)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-send the receipt immediately if we have an email on file.
    // If sending fails (e.g. Brevo hiccup), the record still saves as
    // 'recorded' and the admin can retry from the Send Receipt button.
    let receiptSent = false;
    let receiptError: string | undefined;
    if (data.giver_email) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', auth.session.orgId)
        .single();
      const result = await sendGivingReceipt(data as Giving, auth.session.orgId, org?.name || auth.session.orgName);
      receiptSent = result.success;
      receiptError = result.error;
      if (result.success) {
        data.status = 'sent';
        data.receipt_sent_at = new Date().toISOString();
      }
    }

    return NextResponse.json({ success: true, giving: data, receiptSent, receiptError });
  } catch (error) {
    console.error('Giving POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH - Edit a gift record before the receipt has been sent
export async function PATCH(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const { id, updates } = body;

    if (!id || !updates) {
      return NextResponse.json({ error: 'Record ID and updates are required' }, { status: 400 });
    }

    const allowedKeys = new Set([
      'giver_name', 'giver_email', 'amount', 'currency', 'giving_type',
      'giving_type_other', 'payment_method', 'service_id', 'notes',
    ]);
    const safeUpdates: Record<string, unknown> = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowedKeys.has(key))
    );

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 });
    }

    if (typeof safeUpdates.amount !== 'undefined') {
      const numericAmount = Number(safeUpdates.amount);
      if (!numericAmount || numericAmount <= 0) {
        return NextResponse.json({ error: 'A valid amount greater than 0 is required' }, { status: 400 });
      }
      safeUpdates.amount = numericAmount;
    }

    if (typeof safeUpdates.giving_type !== 'undefined' && !GIVING_TYPES.includes(safeUpdates.giving_type as GivingType)) {
      return NextResponse.json({ error: 'Invalid giving type' }, { status: 400 });
    }

    const { error } = await supabase
      .from('giving')
      .update(safeUpdates)
      .eq('id', id)
      .eq('org_id', auth.session.orgId)
      .eq('status', 'recorded'); // lock editing once a receipt has been sent

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Giving PATCH error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Remove a gift record (e.g. mis-entered)
export async function DELETE(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Record ID is required' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { error } = await supabase
      .from('giving')
      .delete()
      .eq('id', id)
      .eq('org_id', auth.session.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Giving DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
