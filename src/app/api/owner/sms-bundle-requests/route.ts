import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';
import { initializeSmsTopup } from '@/lib/paystack';
import { sendBrevoEmail } from '@/lib/email';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireOwner(); if ('error' in auth) return auth.error;
  const { data, error } = await getServerSupabase().from('sms_bundle_requests').select('id, created_at, requested_credits, budget_ghs, note, status, quoted_amount_ghs, quoted_credits, organizations(name, admin_email)').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}
export async function POST(request: NextRequest) {
  const auth = await requireOwner(); if ('error' in auth) return auth.error;
  try {
    const { requestId, amountGhs, credits } = await request.json();
    if (!requestId || !Number.isFinite(amountGhs) || amountGhs < 5 || !Number.isInteger(credits) || credits < 1) return NextResponse.json({ error: 'Enter a price of at least GHS 5 and the SMS credits to give.' }, { status: 400 });
    const supabase = getServerSupabase();
    const { data: item, error } = await supabase.from('sms_bundle_requests').select('id, org_id, status, organizations(name, admin_email)').eq('id', requestId).single();
    if (error || !item || item.status !== 'requested') return NextResponse.json({ error: 'This request is no longer available.' }, { status: 400 });
    const org = Array.isArray(item.organizations) ? item.organizations[0] : item.organizations as { name: string; admin_email: string };
    const origin = request.headers.get('origin') || 'https://wemotiply.com';
    const payment = await initializeSmsTopup(org.admin_email, item.org_id, amountGhs, `${origin}/api/sms/topup/callback`, credits, item.id);
    await supabase.from('sms_bundle_requests').update({ status: 'payment_sent', quoted_amount_ghs: amountGhs, quoted_credits: credits, paystack_reference: payment.reference, quoted_at: new Date().toISOString() }).eq('id', item.id);
    const mail = await sendBrevoEmail([{ email: org.admin_email, name: org.name }], 'Your WeMotiply SMS bundle is ready', `<p>Hello ${org.name},</p><p>Your special SMS bundle is ready: <strong>${credits.toLocaleString()} SMS credits for GHS ${amountGhs}</strong>.</p><p><a href="${payment.authorization_url}">Pay securely by Mobile Money or card</a>.</p>`);
    if (!mail.success) throw new Error(`Payment link was created, but email could not be sent: ${mail.error}`);
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not send payment link.' }, { status: 500 }); }
}
