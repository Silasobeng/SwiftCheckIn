import { getServerSupabase } from '@/lib/supabase';
import { sendBrevoEmail, orgReplyTo } from '@/lib/email';
import { buildBrandedEmail } from '@/lib/emailTemplate';
import type { Giving } from '@/types';

const GIVING_TYPE_LABELS: Record<string, string> = {
  tithe: 'Tithe',
  offering: 'Offering',
  seed: 'Seed Offering',
  pledge: 'Pledge',
  other: 'Gift',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

function buildReceiptHtml(giving: Giving, orgName: string, brandColor?: string, logoUrl?: string | null, address?: string | null, phone?: string | null, email?: string | null): string {
  const label = giving.giving_type === 'other'
    ? (giving.giving_type_other || 'Gift')
    : GIVING_TYPE_LABELS[giving.giving_type];

  const formattedAmount = `${giving.currency} ${Number(giving.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formattedDate = new Date(giving.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const firstName = giving.giver_name.split(' ')[0];

  // The amount is the whole reason this email exists, so it is stated as a
  // figure above the prose rather than as one line inside a paragraph. Someone
  // checking a receipt is looking for a number, not reading a message.
  return buildBrandedEmail({
    orgName,
    brandColor,
    logoUrl,
    greeting: `Thank you, ${firstName}!`,
    headline: `Your ${label.toLowerCase()} has been received.`,
    body: 'This email is your receipt — keep it for your records.',
    highlight: {
      label,
      value: formattedAmount,
      sub: `Received ${formattedDate} · ${PAYMENT_METHOD_LABELS[giving.payment_method] ?? 'Recorded'}`,
    },
    signOff: 'If anything here looks wrong, just reply to this email and we will put it right.',
    address,
    phone,
    email,
  });
}

/**
 * Sends the giving receipt email, updates the record's status to 'sent',
 * and logs the attempt. Used both right after recording a gift (auto-send)
 * and for manual resend. Returns { success, error? } — never throws.
 */
export async function sendGivingReceipt(
  giving: Giving,
  orgId: string,
  orgName: string,
  brandColor?: string
): Promise<{ success: boolean; error?: string }> {
  if (!giving.giver_email) {
    return { success: false, error: 'No email address on file' };
  }

  const supabase = getServerSupabase();

  // Fetch full org details for branding (logo, contact info)
  const { data: org } = await supabase.from('organizations').select('logo_url, address, phone, email, admin_email').eq('id', orgId).single();

  const label = giving.giving_type === 'other' ? (giving.giving_type_other || 'Gift') : GIVING_TYPE_LABELS[giving.giving_type];

  const result = await sendBrevoEmail(
    [{ email: giving.giver_email, name: giving.giver_name }],
    `Your ${label} Receipt - ${orgName}`,
    buildReceiptHtml(giving, orgName, brandColor, org?.logo_url, org?.address, org?.phone, org?.email),
    orgName,
    undefined,
    // A receipt is the email most likely to be queried ("I gave 200, not 100") —
    // that reply has to reach the church, not a no-reply mailbox.
    orgReplyTo({ ...org, name: orgName })
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
