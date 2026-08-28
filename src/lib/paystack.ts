import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { creditsFromPesewas } from './sms';

// =============================================================
// PAYSTACK BILLING
// =============================================================
// Paystack over PayPal: PayPal accounts registered in Ghana have a long
// history of being able to send money but not reliably receive payouts to a
// Ghanaian bank, and Ghanaian churches pay with Mobile Money (MTN, Vodafone,
// AirtelTigo) and cards, not PayPal balances. Paystack's hosted checkout
// handles both of those directly in GHS.
//
// Amounts sent to Paystack are always in the currency's smallest subunit —
// for GHS that is pesewas, so GHS 89.00 is sent as 8900.

const PAYSTACK_API = 'https://api.paystack.co';
const SUBUNIT = 100;

export type BillingPlan = 'monthly' | 'annual';

// The single source of truth for pricing. The landing page and the
// expired-subscription screen quote these figures, so any change here has to
// be mirrored in both — they are static copy, not read from this object.
//
// Annual is priced at ten months rather than twelve, so a church that pays up
// front gets two months free (89 x 12 = 1,068 against 890, saving 178).
export const PLAN_PRICING: Record<BillingPlan, { amountGHS: number; days: number; label: string }> = {
  monthly: { amountGHS: 89, days: 30, label: 'Monthly' },
  annual: { amountGHS: 890, days: 365, label: 'Annual' },
};

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not configured.');
  return key;
}

function generateReference(): string {
  return `sep-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

export interface InitResult { authorization_url: string; reference: string; }

/** Starts a hosted Paystack checkout for one church's subscription. Paystack's
 *  own page handles card entry and the Mobile Money OTP flow — none of that
 *  is handled by this app, and it never sees a card or MoMo number. */
export async function initializeTransaction(
  email: string, plan: BillingPlan, orgId: string, callbackUrl: string
): Promise<InitResult> {
  const pricing = PLAN_PRICING[plan];
  const reference = generateReference();

  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      amount: pricing.amountGHS * SUBUNIT,
      currency: 'GHS',
      reference,
      callback_url: callbackUrl,
      metadata: { org_id: orgId, plan },
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.status) throw new Error(json.message || 'Could not start checkout.');
  return { authorization_url: json.data.authorization_url, reference: json.data.reference };
}

export interface VerifyResult {
  success: boolean;
  orgId: string | null;
  plan: BillingPlan | null;
  amountGHS: number;
  currency: string;
  customerCode: string | null;
  reference: string;
}

/** Asks Paystack directly whether a reference actually succeeded. Never trust
 *  a client redirect or a webhook payload's own claims — both are just
 *  pointers to check; this call is the actual answer. */
export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const json = await res.json();
  const data = json?.data;
  const metaPlan = data?.metadata?.plan;
  const plan: BillingPlan | null = metaPlan === 'monthly' || metaPlan === 'annual' ? metaPlan : null;

  return {
    success: Boolean(res.ok && json.status && data?.status === 'success'),
    orgId: data?.metadata?.org_id ?? null,
    plan,
    amountGHS: (data?.amount ?? 0) / SUBUNIT,
    currency: data?.currency ?? 'GHS',
    customerCode: data?.customer?.customer_code ?? null,
    reference,
  };
}

/** True only if this request really came from Paystack. Constant-time so the
 *  comparison itself can't leak timing information about the expected value. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader || !/^[0-9a-f]+$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha512', secretKey()).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHeader, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface SmsTopupResult { applied: boolean; credits?: number; reason?: string; }

export async function initializeSmsTopup(
  email: string,
  orgId: string,
  amountGHS: number,
  callbackUrl: string
): Promise<InitResult> {
  const reference = generateReference();
  const pesewas   = Math.round(amountGHS * SUBUNIT);
  const credits   = creditsFromPesewas(pesewas);

  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      amount: pesewas,
      currency: 'GHS',
      reference,
      callback_url: callbackUrl,
      metadata: { org_id: orgId, purpose: 'sms_topup', credits },
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.status) throw new Error(json.message || 'Could not start SMS top-up.');
  return { authorization_url: json.data.authorization_url, reference: json.data.reference };
}

export async function creditSmsTopup(
  supabase: SupabaseClient,
  reference: string
): Promise<SmsTopupResult> {
  const res  = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const json = await res.json();
  const data = json?.data;

  if (!res.ok || !json.status || data?.status !== 'success') {
    return { applied: false, reason: 'Transaction not successful.' };
  }

  const orgId   = data?.metadata?.org_id as string | undefined;
  const credits = data?.metadata?.credits as number | undefined;
  const amountGHS = (data?.amount ?? 0) / SUBUNIT;

  if (!orgId || !credits || credits < 1) {
    return { applied: false, reason: 'Missing or invalid metadata.' };
  }

  // Idempotent insert — UNIQUE constraint on paystack_reference means a retry is a no-op
  const { error: insertError } = await supabase.from('sms_topups').insert({
    org_id:             orgId,
    paystack_reference: reference,
    amount_ghs:         amountGHS,
    credits,
  });
  if (insertError) {
    if (insertError.code === '23505') return { applied: false, reason: 'Already processed.' };
    return { applied: false, reason: insertError.message };
  }

  // Fetch current balance and add credits
  const { data: org } = await supabase
    .from('organizations')
    .select('sms_credits')
    .eq('id', orgId)
    .single();

  await supabase
    .from('organizations')
    .update({ sms_credits: (org?.sms_credits ?? 0) + credits, updated_at: new Date().toISOString() })
    .eq('id', orgId);

  return { applied: true, credits };
}

export interface ActivationResult { applied: boolean; reason?: string; }

/**
 * Records the payment and extends the church's subscription. Idempotent by
 * design: payments.paystack_reference is UNIQUE, so the same reference
 * verified twice — a customer refreshing the callback page, a Paystack
 * webhook retry after the callback already processed it — inserts once, and
 * every later attempt is a harmless no-op rather than a double-extended
 * subscription.
 */
export async function activateSubscription(
  supabase: SupabaseClient,
  result: VerifyResult,
  rawEvent: unknown
): Promise<ActivationResult> {
  if (!result.success || !result.orgId || !result.plan) {
    return { applied: false, reason: 'Transaction not successful or missing metadata.' };
  }
  const pricing = PLAN_PRICING[result.plan];

  const { error: insertError } = await supabase.from('payments').insert({
    org_id: result.orgId,
    paystack_reference: result.reference,
    plan: result.plan,
    amount: result.amountGHS,
    currency: result.currency,
    status: 'success',
    raw_event: rawEvent as object,
  });

  if (insertError) {
    // 23505 = unique_violation — this exact reference was already recorded,
    // most likely by the callback and the webhook both landing for the same
    // payment. Not an error; just nothing left to do.
    if (insertError.code === '23505') return { applied: false, reason: 'Already processed.' };
    return { applied: false, reason: insertError.message };
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('subscription_end_date')
    .eq('id', result.orgId)
    .single();

  // Paying while time remains — a trial not yet over, or renewing before an
  // active plan expires — extends from that remaining date, not from today.
  // Otherwise renewing a few days early would cost the church those days.
  const now = new Date();
  let base = now;
  if (org?.subscription_end_date) {
    const existingEnd = new Date(`${org.subscription_end_date}T00:00:00Z`);
    if (existingEnd > now) base = existingEnd;
  }
  const newEnd = new Date(base);
  newEnd.setUTCDate(newEnd.getUTCDate() + pricing.days);

  const { error: updateError } = await supabase
    .from('organizations')
    .update({
      subscription_status: 'active',
      subscription_plan: result.plan,
      subscription_end_date: newEnd.toISOString().slice(0, 10),
      paystack_customer_code: result.customerCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', result.orgId);

  if (updateError) return { applied: false, reason: updateError.message };
  return { applied: true };
}
