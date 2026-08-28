import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { verifyTransaction, activateSubscription } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

// GET - Paystack redirects the customer's browser here after checkout,
// success or failure. This exists for the UX — sending them back to the app
// with a clear message. It is not the authoritative record: the webhook
// below is, since it doesn't depend on the browser actually returning (a
// closed tab, a flaky connection right after paying, etc.). Both call the
// same idempotent activateSubscription(), so whichever arrives first wins
// and the other is a safe no-op.
export async function GET(request: NextRequest) {
  // Fallback only matters if NEXT_PUBLIC_APP_URL is unset — it points at the
  // live domain so a missing env var sends a paying customer back to the real
  // app rather than an old preview URL.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wemotiply.com';
  const reference = request.nextUrl.searchParams.get('reference') || request.nextUrl.searchParams.get('trxref');

  if (!reference) {
    return NextResponse.redirect(`${appUrl}/admin?billing=failed`);
  }

  try {
    const result = await verifyTransaction(reference);
    if (!result.success) {
      return NextResponse.redirect(`${appUrl}/admin?billing=failed`);
    }
    const supabase = getServerSupabase();
    await activateSubscription(supabase, result, { source: 'callback' });
    return NextResponse.redirect(`${appUrl}/admin?billing=success`);
  } catch (error) {
    console.error('Billing callback error:', error);
    return NextResponse.redirect(`${appUrl}/admin?billing=failed`);
  }
}
