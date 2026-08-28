import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';
import { initializeTransaction, type BillingPlan } from '@/lib/paystack';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST - Start a hosted Paystack checkout for this church's subscription.
//
// Deliberately guarded by requireAuth(), not requireActiveSubscription() —
// the entire point of this route is to let a trial-ended or expired church
// pay, so it can't itself require an active subscription just to be reached.
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const ip = getClientIP(request);
  const rateCheck = checkRateLimit(`billing-checkout:${ip}`, RATE_LIMITS.api);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a moment.' }, { status: 429 });
  }

  try {
    const { plan } = await request.json();
    if (plan !== 'monthly' && plan !== 'annual') {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { data: org } = await supabase
      .from('organizations')
      .select('admin_email')
      .eq('id', auth.session.orgId)
      .single();

    if (!org?.admin_email) {
      return NextResponse.json({ error: 'Could not find this account.' }, { status: 404 });
    }

    // Fallback only matters if NEXT_PUBLIC_APP_URL is unset — it points at the
    // live domain so Paystack returns the payer to the real app.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wemotiply.com';
    const callbackUrl = `${appUrl}/api/billing/callback`;

    const { authorization_url } = await initializeTransaction(
      org.admin_email, plan as BillingPlan, auth.session.orgId, callbackUrl
    );

    return NextResponse.json({ authorization_url });
  } catch (error) {
    console.error('Billing checkout error:', error);
    const message = error instanceof Error ? error.message : 'Could not start checkout.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
