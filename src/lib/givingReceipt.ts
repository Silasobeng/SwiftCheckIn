import { getServerSupabase } from '@/lib/supabase';
import { sendBrevoEmail } from '@/lib/email';
import type { Giving } from '@/types';

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

/**
 * Sends the giving receipt email, updates the record's status to 'sent',
 * and logs the attempt. Used both right after recording a gift (auto-send)
 * and for manual resend. Returns { success, error? } — never throws.
 */
export async function sendGivingReceipt(
  giving: Giving,
  orgId: string,
  orgName: string
): Promise<{ success: boolean; error?: string }> {
  if (!giving.giver_email) {
    return { success: false, error: 'No email address on file' };
  }

  const supabase = getServerSupabase();
  const label = giving.giving_type === 'other' ? (giving.giving_type_other || 'Gift') : GIVING_TYPE_LABELS[giving.giving_type];

  const result = await sendBrevoEmail(
    [{ email: giving.giver_email, name: giving.giver_name }],
    `Your ${label} Receipt - ${orgName}`,
    buildReceiptHtml(giving, orgName),
    orgName
  );

  await supabase.from('email_logs').insert({
    org_id: orgId,
    person_id: giving.person_id,
    email_type: 'giving_receipt',
    subject: `Your ${label} Receipt`,
    recipient_email: giving.giver_email,
    status: result.success ? 'sent' : 'failed',
  });

  if (!result.success) {
    return { success: false, error: result.error || 'Failed to send receipt email' };
  }

  const { error: updateError } = await supabase
    .from('giving')
    .update({ status: 'sent', receipt_sent_at: new Date().toISOString() })
    .eq('id', giving.id)
    .eq('org_id', orgId);

  if (updateError) {
    return { success: false, error: 'Receipt sent, but failed to update record status' };
  }

  return { success: true };
}
