import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST - Resend's delivery-event webhook. The only two events this cares
// about are a hard bounce and a spam complaint — both mean the address is
// dead or actively unwanted, so every future automated send (welcome,
// birthday, missed-service) should stop trying it rather than repeating the
// same failed attempt forever. Every other event (delivered, opened,
// clicked, soft/transient bounce) is acknowledged and ignored — a soft
// bounce in particular is often temporary (mailbox full, a brief outage)
// and shouldn't permanently block someone who could still receive email
// tomorrow.
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Resend webhook: RESEND_WEBHOOK_SECRET not configured — cannot verify request.');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  // Signature verification needs the RAW body — parsing it to JSON first and
  // re-serialising is not guaranteed to reproduce the exact bytes Resend
  // signed, same reason the Paystack webhook reads text() before anything
  // else touches the request.
  const payload = await request.text();

  // The SDK wants the three Svix values as a plain object, not the raw
  // Headers instance — id/timestamp/signature pulled from their matching
  // svix-* request headers.
  const svixHeaders = {
    id: request.headers.get('svix-id') || '',
    timestamp: request.headers.get('svix-timestamp') || '',
    signature: request.headers.get('svix-signature') || '',
  };

  let event;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    event = resend.webhooks.verify({ payload, headers: svixHeaders, webhookSecret: secret });
  } catch (err) {
    console.error('Resend webhook: signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // AWS SES-style classification underneath Resend: "Permanent" is a real
  // hard bounce (address doesn't exist, domain doesn't exist). "Transient"
  // and "Undetermined" are temporary/unclear and are deliberately NOT
  // suppressed here. Narrowing on event.type first (rather than reading
  // event.data.to blindly) is what makes data.bounce/.to valid below —
  // several other event types (contact/domain/suppression events) don't
  // carry a recipient list at all.
  if (event.type !== 'email.complained' && event.type !== 'email.bounced') {
    return NextResponse.json({ received: true });
  }
  const isHardBounce = event.type === 'email.bounced'
    && event.data.bounce?.type?.toLowerCase() === 'permanent';
  const isComplaint = event.type === 'email.complained';

  if (isComplaint || isHardBounce) {
    const supabase = getServerSupabase();
    const now = new Date().toISOString();
    const recipients = (event.data.to || []).map((e: string) => e.trim()).filter(Boolean);

    for (const email of recipients) {
      // Case-insensitive, and intentionally not scoped to one org — a
      // hard-bounced or complained-about address is invalid everywhere,
      // not just for the church that happened to trigger this send.
      const { error } = await supabase
        .from('people')
        .update({ email_invalid_at: now })
        .ilike('email', email);
      if (error) console.error('Resend webhook: could not flag invalid email:', error.message);
    }
  }

  return NextResponse.json({ received: true });
}
