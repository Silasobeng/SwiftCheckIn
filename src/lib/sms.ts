import { getServerSupabase } from './supabase';

// 0.40 GHC per SMS charged to churches. Arkesel costs ~0.28 GHC/SMS (~$0.02).
const PRICE_PER_SMS_PESEWAS = 40;

// Arkesel expects +233XXXXXXXXX for Ghana numbers.
// DB stores whatever the kiosk operator typed: 0XXXXXXXXX, 233XXXXXXXXX, +233XXXXXXXXX, or 9 bare digits.
function formatGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10)   return `+233${digits.slice(1)}`;
  if (digits.length === 9)                               return `+233${digits}`;
  return `+${digits}`;
}

export function creditsFromPesewas(pesewas: number): number {
  return Math.floor(pesewas / PRICE_PER_SMS_PESEWAS);
}

export function welcomeMessage(firstName: string, orgName: string): string {
  return `Hi ${firstName}, welcome to ${orgName}! We're glad you joined us today. Hope to see you again soon.`;
}

export function birthdayMessage(firstName: string, orgName: string): string {
  return `Happy Birthday, ${firstName}! The ${orgName} family wishes you a wonderful and blessed day.`;
}

export function missedMessage(firstName: string, orgName: string): string {
  return `Hi ${firstName}, we missed you at ${orgName} recently. Hope you're well - we'd love to see you again.`;
}

export async function sendSMS(
  phone: string,
  message: string,
  orgId: string,
  smsType: string,
  personId?: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey  = process.env.ARKESEL_API_KEY;
  const sender  = process.env.ARKESEL_SENDER_ID || 'WeMotiply';

  if (!apiKey) {
    console.warn('ARKESEL_API_KEY not configured — SMS not sent');
    return { success: false, error: 'SMS not configured' };
  }

  const supabase = getServerSupabase();

  // Read and decrement credits — gte guard prevents going below zero
  const { data: org } = await supabase
    .from('organizations')
    .select('sms_credits')
    .eq('id', orgId)
    .single();

  if (!org || org.sms_credits < 1) {
    return { success: false, error: 'Insufficient SMS credits' };
  }

  await supabase
    .from('organizations')
    .update({ sms_credits: org.sms_credits - 1, updated_at: new Date().toISOString() })
    .eq('id', orgId)
    .gte('sms_credits', 1);

  const recipient = formatGhanaPhone(phone);
  let status: 'sent' | 'failed' = 'failed';
  let arkeselResponse: unknown = null;

  try {
    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, message, recipients: [recipient] }),
    });
    arkeselResponse = await res.json();
    if (res.ok) status = 'sent';
  } catch (err) {
    console.error('Arkesel send error:', err);
  }

  await supabase.from('sms_logs').insert({
    org_id: orgId,
    person_id: personId ?? null,
    sms_type: smsType,
    recipient_phone: recipient,
    message,
    status,
    arkesel_response: arkeselResponse,
  });

  return status === 'sent' ? { success: true } : { success: false, error: 'SMS delivery failed' };
}
