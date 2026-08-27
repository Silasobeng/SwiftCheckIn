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
    recipient_filter?: string;  // 'all' | 'members' | 'visitors' | 'group:<uuid>'
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

  const sender = (body.sender_id || freshOrg.sms_sender_id || process.env.ARKESEL_SENDER_ID || 'WeMotiply').slice(0, 11);

  // Deduct upfront; refund failures after
  await supabase
    .from('organizations')
    .update({ sms_credits: freshOrg.sms_credits - creditsNeeded, updated_at: new Date().toISOString() })
    .eq('id', orgId)
    .gte('sms_credits', creditsNeeded);

  // ─── Send ─────────────────────────────────────────────
  const { delivered, failed } = await sendSMSBatched(apiKey, sender, message, recipients);

  // Refund credits for failed deliveries
  const failedCredits = failed * smsParts;
  if (failedCredits > 0) {
    const { data: afterOrg } = await supabase
      .from('organizations')
      .select('sms_credits')
      .eq('id', orgId)
      .single();
    if (afterOrg) {
      await supabase
        .from('organizations')
        .update({ sms_credits: afterOrg.sms_credits + failedCredits, updated_at: new Date().toISOString() })
        .eq('id', orgId);
    }
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
