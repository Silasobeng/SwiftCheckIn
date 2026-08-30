import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';
import { formatGhanaPhone, sendSMSBatched } from '@/lib/sms';

export const dynamic = 'force-dynamic';

// GET — recent broadcasts for this org
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  const supabase = getServerSupabase();
  const { data } = await supabase
    .from('sms_broadcasts')
    .select('*')
    .eq('org_id', auth.session.orgId)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ broadcasts: data || [] });
}

// POST — send a broadcast
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;
  const orgId = auth.session.orgId;

  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'SMS not configured' }, { status: 500 });

  const body = await request.json() as {
    message?: string;
    recipient_filter?: string;  // 'all' | 'members' | 'visitors' | 'group:<uuid>' | 'specific'
    person_ids?: string[];      // only used when recipient_filter === 'specific'
    sender_id?: string;
  };

  const message = (body.message || '').trim();
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  if (message.length > 459) return NextResponse.json({ error: 'Message too long (max 459 characters / 3 parts)' }, { status: 400 });

  const recipientFilter = body.recipient_filter || 'all';
  const supabase = getServerSupabase();

  // ─── Pull recipients ──────────────────────────────────
  let query = supabase
    .from('people')
    .select('id, phone')
    .eq('org_id', orgId)
    .eq('archived', false)
    .eq('sms_opted_out', false)
    .not('phone', 'is', null);

  if (recipientFilter === 'members') {
    query = query.eq('role', 'member');
  } else if (recipientFilter === 'visitors') {
    query = query.eq('role', 'visitor');
  } else if (recipientFilter.startsWith('group:')) {
    const groupId = recipientFilter.slice(6);
    // people_groups join — get person ids in this group first
    const { data: memberships } = await supabase
      .from('people_groups')
      .select('person_id')
      .eq('group_id', groupId);
    const ids = (memberships || []).map((m: { person_id: string }) => m.person_id);
    if (ids.length === 0) return NextResponse.json({ error: 'No members in that group' }, { status: 400 });
    query = query.in('id', ids);
  } else if (recipientFilter === 'specific') {
    // Hand-picked recipients, not a role or a standing group — the archived/
    // opted-out/has-phone filters above still apply, so a person removed or
    // opted out since being picked in the browser is silently excluded here
    // rather than trusting the client's list at face value.
    const ids = Array.isArray(body.person_ids) ? body.person_ids.filter((id): id is string => typeof id === 'string') : [];
    if (ids.length === 0) return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });
    query = query.in('id', ids);
  }

  const { data: people, error: peopleError } = await query;
  if (peopleError) return NextResponse.json({ error: 'Could not load recipients' }, { status: 500 });

  const recipients = Array.from(new Set(
    (people || [])
      .map((p: { id: string; phone: string }) => formatGhanaPhone(p.phone))
      .filter(Boolean)
  ));

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients found for this filter' }, { status: 400 });
  }

  // SMS parts: each part = 160 chars (plain) or 153 chars when multi-part
  const smsParts = message.length <= 160 ? 1 : Math.ceil(message.length / 153);
  const creditsNeeded = recipients.length * smsParts;

  // ─── Check and deduct credits ─────────────────────────
  const { data: freshOrg } = await supabase
    .from('organizations')
    .select('sms_credits, sms_sender_id')
    .eq('id', orgId)
    .single();

  if (!freshOrg || freshOrg.sms_credits < creditsNeeded) {
    return NextResponse.json({
      error: 'Insufficient SMS credits',
      required: creditsNeeded,
      available: freshOrg?.sms_credits ?? 0,
    }, { status: 402 });
  }

  // Sender identity is organisation-owned. Never accept it from the browser.
  const sender = (freshOrg.sms_sender_id || process.env.ARKESEL_SENDER_ID || 'WeMotiply').slice(0, 11);

  // Deduct atomically so simultaneous broadcasts cannot overspend credits.
  const { data: debitSucceeded, error: debitError } = await supabase.rpc('debit_sms_credits', {
    target_org_id: orgId,
    credit_amount: creditsNeeded,
  });
  if (debitError) {
    // A real RPC failure (e.g. the function missing from the database) is
    // not the same thing as insufficient credits, and reporting it as such
    // hid exactly that bug once already — surface what Postgres actually
    // said instead of relabeling every failure as a balance problem.
    console.error('debit_sms_credits RPC error:', debitError.message);
    return NextResponse.json({ error: `Could not deduct SMS credits: ${debitError.message}` }, { status: 500 });
  }
  if (!debitSucceeded) {
    return NextResponse.json({ error: 'Insufficient SMS credits', required: creditsNeeded, available: freshOrg.sms_credits }, { status: 402 });
  }

  // ─── Send ─────────────────────────────────────────────
  const { delivered, failed } = await sendSMSBatched(apiKey, sender, message, recipients);

  // Refund atomically if the provider rejects part of the broadcast.
  const failedCredits = failed * smsParts;
  if (failedCredits > 0) {
    await supabase.rpc('refund_sms_credits', {
      target_org_id: orgId,
      credit_amount: failedCredits,
    });
  }

  const creditsUsed = delivered * smsParts;
  const status = failed === 0 ? 'delivered' : delivered === 0 ? 'failed' : 'partial';

  // ─── Log broadcast ────────────────────────────────────
  await supabase.from('sms_broadcasts').insert({
    org_id: orgId,
    message,
    sender_id: sender,
    recipient_filter: recipientFilter,
    recipient_count: recipients.length,
    credits_used: creditsUsed,
    delivered_count: delivered,
    failed_count: failed,
    status,
  });

  return NextResponse.json({ delivered, failed, credits_used: creditsUsed, status });
}
