import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { initializeSmsTopup } from '@/lib/paystack';
import { findSmsTopupPackage, smsCreditsForCustomTopup } from '@/lib/smsPricing';

export const dynamic = 'force-dynamic';

// POST - Start a Paystack checkout to top up this org's SMS credits.
// Body: { amountGhc?: number, packageId?: string }
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const { amountGhc, packageId } = await request.json();
    const { data: sales } = await (await import('@/lib/supabase')).getServerSupabase().from('platform_settings').select('sms_sales_available').eq('id', true).maybeSingle();
    if (sales?.sms_sales_available === false) return NextResponse.json({ error: 'SMS credits are temporarily being restocked. Please try again shortly or contact support for urgent help.' }, { status: 503 });
    const selectedPackage = findSmsTopupPackage(packageId);
    const paymentAmount = selectedPackage?.amountGhc ?? amountGhc;
    const credits = selectedPackage?.credits ??
      (typeof paymentAmount === 'number' ? smsCreditsForCustomTopup(paymentAmount) : 0);

    if (typeof paymentAmount !== 'number' || paymentAmount < 5 || credits < 1) {
      return NextResponse.json({ error: 'Minimum top-up is 5 GHC (50 SMS credits).' }, { status: 400 });
    }
    if (paymentAmount > 5000) {
      return NextResponse.json({ error: 'Maximum single top-up is 5,000 GHC.' }, { status: 400 });
    }

    const origin      = request.headers.get('origin') || 'https://wemotiply.com';
    // Routed through a verifying callback, not straight to /admin — Paystack
    // redirects here regardless of outcome, so this can't just hardcode
    // "success" into the URL (it used to, and the admin page never even read
    // the param, so a church had no way to tell a top-up landed either way).
    const callbackUrl = `${origin}/api/sms/topup/callback`;

    const { authorization_url, access_code } = await initializeSmsTopup(
      auth.session.adminEmail,
      auth.session.orgId,
      paymentAmount,
      callbackUrl,
      credits
    );

    return NextResponse.json({ authorizationUrl: authorization_url, accessCode: access_code });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not start top-up.';
    console.error('SMS topup error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
