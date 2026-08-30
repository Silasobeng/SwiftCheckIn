import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';
import { creditSmsTopup } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

// POST — called by the browser right after Paystack's inline popup reports
// success, so the credit lands and the page can update without ever leaving
// it. Not the authoritative source of truth (the webhook is, and doesn't
// depend on the browser sticking around) — this just re-verifies the same
// reference against Paystack directly and is idempotent, so it's safe to
// call even if the webhook already got there first.
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  const { reference } = await request.json().catch(() => ({ reference: undefined }));
  if (!reference || typeof reference !== 'string') {
    return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const result = await creditSmsTopup(supabase, reference);

  if (result.applied) {
    return NextResponse.json({ success: true, credits: result.credits });
  }
  // "Already processed" covers the webhook having won the race — still a
  // real success, just not one this call gets to report a credit amount for.
  if (result.reason === 'Already processed.') {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, error: result.reason || 'Payment could not be verified.' }, { status: 402 });
}
