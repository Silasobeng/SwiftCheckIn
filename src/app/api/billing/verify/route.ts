import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { verifyTransaction, activateSubscription } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

// POST — called by the browser right after Paystack's inline popup reports
// success, so the subscription activates and the page can update without
// ever leaving it. Not the authoritative source of truth (the webhook is,
// and doesn't depend on the browser sticking around) — this just re-
// verifies the same reference against Paystack directly and is idempotent,
// so it's safe to call even if the webhook already got there first.
//
// Deliberately unauthenticated like /api/billing/callback — the whole point
// is to let a trial-ended or expired church pay, so it can't require an
// active subscription just to confirm the payment that would create one.
export async function POST(request: NextRequest) {
  const { reference } = await request.json().catch(() => ({ reference: undefined }));
  if (!reference || typeof reference !== 'string') {
    return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
  }

  try {
    const result = await verifyTransaction(reference);
    if (!result.success) {
      return NextResponse.json({ success: false, error: 'Payment was not successful.' }, { status: 402 });
    }
    const supabase = getServerSupabase();
    const activation = await activateSubscription(supabase, result, { source: 'inline-verify' });
    if (!activation.applied && activation.reason !== 'Already processed.') {
      return NextResponse.json({ success: false, error: activation.reason || 'Could not activate subscription.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, plan: result.plan });
  } catch (error) {
    console.error('Billing inline-verify error:', error);
    return NextResponse.json({ success: false, error: 'Could not verify payment.' }, { status: 500 });
  }
}
