import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { sendGivingReceipt } from '@/lib/givingReceipt';
import type { Giving } from '@/types';

export const dynamic = 'force-dynamic';

// POST - Send (or resend) the giving receipt email
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { id } = params;

    const { data: giving, error: fetchError } = await supabase
      .from('giving')
      .select('*')
      .eq('id', id)
      .eq('org_id', auth.session.orgId)
      .single();

    if (fetchError || !giving) {
      return NextResponse.json({ error: 'Giving record not found' }, { status: 404 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, brand_color')
      .eq('id', auth.session.orgId)
      .single();

    const result = await sendGivingReceipt(giving as Giving, auth.session.orgId, org?.name || auth.session.orgName, org?.brand_color);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send receipt email' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Send receipt error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
