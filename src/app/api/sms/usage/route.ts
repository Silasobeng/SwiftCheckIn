import { NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET — credits spent per SMS type over the last 30 days, so a church can see
// where its balance is actually going before deciding which toggle to flip.
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  const supabase = getServerSupabase();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: logs } = await supabase
    .from('sms_logs')
    .select('sms_type, status')
    .eq('org_id', auth.session.orgId)
    .gte('created_at', since);

  const byType: Record<string, number> = {};
  for (const log of logs || []) {
    if (log.status !== 'sent') continue;
    byType[log.sms_type] = (byType[log.sms_type] || 0) + 1;
  }

  const { data: broadcasts } = await supabase
    .from('sms_broadcasts')
    .select('credits_used')
    .eq('org_id', auth.session.orgId)
    .gte('created_at', since);

  const broadcastCredits = (broadcasts || []).reduce((sum, b) => sum + (b.credits_used || 0), 0);
  if (broadcastCredits > 0) byType.broadcast = broadcastCredits;

  return NextResponse.json({ since, usage: byType });
}
