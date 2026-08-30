import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { creditSmsTopup } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

// GET - Paystack redirects the customer's browser here after an SMS top-up
// checkout, success or failure. This exists for the UX; the webhook remains
// authoritative (doesn't depend on the browser actually returning). Both
// call the same idempotent creditSmsTopup(), so whichever arrives first wins
// and the other is a safe no-op — which is exactly why "not applied" here
// isn't automatically a failure: it also covers the very common case where
// the webhook already credited this reference a moment before the browser
// made it back.
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wemotiply.com';
  const dest = `${appUrl}/admin?tab=settings`;
  const reference = request.nextUrl.searchParams.get('reference') || request.nextUrl.searchParams.get('trxref');

  if (!reference) {
    return NextResponse.redirect(`${dest}&topup=failed`);
  }

  try {
    const supabase = getServerSupabase();
    const result = await creditSmsTopup(supabase, reference);

    if (result.applied) {
      return NextResponse.redirect(`${dest}&topup=success&credits=${result.credits}`);
    }
    // The webhook already handled this exact reference — a real success,
    // just not one this request gets to report the credit amount for.
    if (result.reason === 'Already processed.') {
      return NextResponse.redirect(`${dest}&topup=success`);
    }
    return NextResponse.redirect(`${dest}&topup=failed`);
  } catch (error) {
    console.error('SMS topup callback error:', error);
    return NextResponse.redirect(`${dest}&topup=failed`);
  }
}
