import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { verifyWebhookSignature, verifyTransaction, activateSubscription } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

// POST - Paystack's server-to-server payment notification. This is the
// authoritative source for activating a subscription, not the browser
// callback route — Paystack sends this regardless of whether the customer's
// browser ever makes it back to the app.
//
// The signature is computed over the RAW request body, so it has to be read
// as text before anything parses it — re-serialising parsed JSON is not
// guaranteed to reproduce the exact bytes Paystack signed.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error('Billing webhook: signature mismatch — request did not come from Paystack.');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Only a successful charge extends a subscription. Every other event
  // Paystack sends is acknowledged and otherwise ignored.
  if (event.event === 'charge.success' && event.data?.reference) {
    try {
      // Re-verify against Paystack's own API rather than trusting the webhook
      // payload's fields directly — the signature proves the request came
      // from Paystack, not that the embedded data is the current, final state.
      const result = await verifyTransaction(event.data.reference);
      const supabase = getServerSupabase();
      await activateSubscription(supabase, result, event);
    } catch (error) {
      console.error('Billing webhook processing error:', error);
      // Still respond 200 below — Paystack retries on a non-2xx response,
      // and retrying a processing bug won't fix it. This is logged instead.
    }
  }

  return NextResponse.json({ received: true });
}
