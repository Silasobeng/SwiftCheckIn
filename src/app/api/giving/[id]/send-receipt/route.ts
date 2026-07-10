import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { sendBrevoEmail } from '@/lib/email';
import type { Giving } from '@/types';

export const dynamic = 'force-dynamic';

const GIVING_TYPE_LABELS: Record<string, string> = {
  tithe: 'Tithe',
  offering: 'Offering',
  seed: 'Seed Offering',
  pledge: 'Pledge',
  other: 'Gift',
};

function buildReceiptHtml(giving: Giving, orgName: string): string {
  const label = giving.giving_type === 'other'
    ? (giving.giving_type_other || 'Gift')
    : GIVING_TYPE_LABELS[giving.giving_type];

  const formattedAmount = `${giving.currency} ${Number(giving.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formattedDate = new Date(giving.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const firstName = giving.giver_name.split(' ')[0];

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #16243A; font-size: 26px; margin: 0;">${orgName}</h1>
      </div>
      <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #E4DFD5;">
        <h2 style="color: #16243A; font-size: 20px; margin-top: 0;">Thank you, ${firstName}!</h2>
        <p style="color: #486581; font-size: 15px; line-height: 1.7;">
          We're writing to confirm that we've received your ${label.toLowerCase()}. This email serves as your receipt.
        </p>
        <div style="background: #F8F4EE; border-radius: 10px; padding: 20px 24px; margin: 24px 0;">
          <table style="width: 100%; font-size: 14px; color: #16243A;">
            <tr><td style="padding: 6px 0; color: #7A6E60;">Type</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${label}</td></tr>
            <tr><td style="padding: 6px 0; color: #7A6E60;">Amount</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${formattedAmount}</td></tr>
            <tr><td style="padding: 6px 0; color: #7A6E60;">Date</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${formattedDate}</td></tr>
          </table>
        </div>
        <p style="color: #829ab1; font-size: 13px; line-height: 1.6;">
          If you believe this was recorded in error, please reach out to us directly.
        </p>
      </div>
      <p style="text-align: center; color: #829ab1; font-size: 12px; margin-top: 24px;">
        © ${new Date().getFullYear()} ${orgName}
      </p>
    </div>
  `;
}

// POST - Send (or resend) the giving receipt email
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { id } = params;

    const { data: giving, error: fetchError } = await supabase
      .from('giving')
      .select('*')
      .eq('id', id)
      .eq('org_id', auth.session.orgId)
      .single();

    if (fetchError || !giving) {
      return NextResponse.json({ error: 'Giving record not found' }, { status: 404 });
    }

    if (!giving.giver_email) {
      return NextResponse.json({ error: 'This record has no email address to send a receipt to' }, { status: 400 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', auth.session.orgId)
      .single();

    const orgName = org?.name || auth.session.orgName;
    const label = giving.giving_type === 'other' ? (giving.giving_type_other || 'Gift') : GIVING_TYPE_LABELS[giving.giving_type];

    const result = await sendBrevoEmail(
      [{ email: giving.giver_email, name: giving.giver_name }],
      `Your ${label} Receipt - ${orgName}`,
      buildReceiptHtml(giving as Giving, orgName),
      orgName
    );

    if (!result.success) {
      await supabase.from('email_logs').insert({
        org_id: auth.session.orgId,
        person_id: giving.person_id,
        email_type: 'giving_receipt',
        subject: `Your ${label} Receipt`,
        recipient_email: giving.giver_email,
        status: 'failed',
      });
      return NextResponse.json({ error: result.error || 'Failed to send receipt email' }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from('giving')
      .update({ status: 'sent', receipt_sent_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', auth.session.orgId);

    if (updateError) {
      return NextResponse.json({ error: 'Receipt sent, but failed to update record status' }, { status: 500 });
    }

    await supabase.from('email_logs').insert({
      org_id: auth.session.orgId,
      person_id: giving.person_id,
      email_type: 'giving_receipt',
      subject: `Your ${label} Receipt`,
      recipient_email: giving.giver_email,
      status: 'sent',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Send receipt error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
