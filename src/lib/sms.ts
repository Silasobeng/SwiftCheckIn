import { getServerSupabase } from './supabase';

// 0.40 GHC per SMS charged to churches. Arkesel costs ~0.28 GHC/SMS (~$0.02).
const PRICE_PER_SMS_PESEWAS = 40;
const ARKESEL_API_URL = 'https://sms.arkesel.com/api/v2/sms/send';
const BATCH_SIZE = 100; // Arkesel max recipients per request

// Arkesel expects +233XXXXXXXXX for Ghana numbers.
// DB stores whatever the kiosk operator typed: 0XXXXXXXXX, 233XXXXXXXXX, +233XXXXXXXXX, or 9 bare digits.
export function formatGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10)   return `+233${digits.slice(1)}`;
  if (digits.length === 9)                               return `+233${digits}`;
  return `+${digits}`;
}

// ─── Batched send (ported from QuickXend) ───────────────
// Splits large recipient lists into chunks of 100, sends sequentially.
async function sendBatch(
  apiKey: string, sender: string, message: string, recipients: string[]
): Promise<{ success: boolean; delivered: number; failed: number }> {
  try {
    const res = await fetch(ARKESEL_API_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: sender.slice(0, 11), message, recipients }),
    });
    if (!res.ok) {
      console.error(`[Arkesel] HTTP ${res.status}`);
      return { success: false, delivered: 0, failed: recipients.length };
    }
    return { success: true, delivered: recipients.length, failed: 0 };
  } catch (err) {
    console.error('[Arkesel] batch error:', err);
    return { success: false, delivered: 0, failed: recipients.length };
  }
}

export async function sendSMSBatched(
  apiKey: string, sender: string, message: string, recipients: string[]
): Promise<{ delivered: number; failed: number }> {
  let delivered = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const result = await sendBatch(apiKey, sender, message, batch);
    delivered += result.delivered;
    failed    += result.failed;
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return { delivered, failed };
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
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) {
    console.warn('ARKESEL_API_KEY not configured — SMS not sent');
    return { success: false, error: 'SMS not configured' };
  }

  const supabase = getServerSupabase();

  // Read and decrement credits — gte guard prevents going below zero
  const { data: org } = await supabase
    .from('organizations')
    .select('sms_credits, sms_sender_id')
    .eq('id', orgId)
    .single();

  if (!org || org.sms_credits < 1) {
    return { success: false, error: 'Insufficient SMS credits' };
  }

  const sender = (org.sms_sender_id as string | null) || process.env.ARKESEL_SENDER_ID || 'WeMotiply';

  await supabase
    .from('organizations')
    .update({ sms_credits: org.sms_credits - 1, updated_at: new Date().toISOString() })
    .eq('id', orgId)
    .gte('sms_credits', 1);

  const recipient = formatGhanaPhone(phone);
  let status: 'sent' | 'failed' = 'failed';
  let arkeselResponse: unknown = null;

  try {
    const res = await fetch(ARKESEL_API_URL, {
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
