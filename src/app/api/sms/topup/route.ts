import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { initializeSmsTopup } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

// POST - Start a Paystack checkout to top up this org's SMS credits.
// Body: { amountGhc: number }   (minimum 5 GHC = 12 credits)
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const { amountGhc } = await request.json();

    if (typeof amountGhc !== 'number' || amountGhc < 5) {
      return NextResponse.json({ error: 'Minimum top-up is 5 GHC.' }, { status: 400 });
    }
    if (amountGhc > 5000) {
      return NextResponse.json({ error: 'Maximum single top-up is 5,000 GHC.' }, { status: 400 });
    }

    const origin      = request.headers.get('origin') || 'https://wemotiply.com';
    // Routed through a verifying callback, not straight to /admin — Paystack
    // redirects here regardless of outcome, so this can't just hardcode
    // "success" into the URL (it used to, and the admin page never even read
    // the param, so a church had no way to tell a top-up landed either way).
    const callbackUrl = `${origin}/api/sms/topup/callback`;

    const { authorization_url } = await initializeSmsTopup(
      auth.session.adminEmail,
      auth.session.orgId,
      amountGhc,
      callbackUrl
    );

    return NextResponse.json({ authorizationUrl: authorization_url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not start top-up.';
    console.error('SMS topup error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
