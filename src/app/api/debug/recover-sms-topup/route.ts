import { NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';
import { creditSmsTopup } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

// One-off — recovers a specific SMS top-up (GHS 5, ref below, 30 Aug 2026)
// that was paid successfully on Paystack but never credited. The old
// callback URL pointed straight at /admin instead of a route that actually
// called creditSmsTopup, so only the webhook could have applied it — and
// evidently didn't fire or wasn't registered. creditSmsTopup re-verifies
// this reference against Paystack directly before crediting anything, and
// is idempotent, so this is safe even if it turns out to already be
// applied. Remove this route after use.
const REFERENCE = 'sep-1788097636698-2cbabff0bbe7';

export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  const supabase = getServerSupabase();
  const result = await creditSmsTopup(supabase, REFERENCE);

  // Read the actual stored balance directly, bypassing whatever the
  // Settings page fetches/renders — "Already processed" only proves a
  // topup row exists, not that this org's number reflects it.
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, sms_credits')
    .eq('id', auth.session.orgId)
    .single();

  const { data: topupRow } = await supabase
    .from('sms_topups')
    .select('*')
    .eq('paystack_reference', REFERENCE)
    .maybeSingle();

  return NextResponse.json({ result, currentOrg: org, topupRow });
}
