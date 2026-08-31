import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function extractRecipients(payload: UnknownRecord): string[] {
  const recipients = new Set<string>();

  for (const message of values(payload.event_message)) {
    if (!isRecord(message) || !isRecord(message.email_info)) continue;
    for (const recipient of values(message.email_info.to)) {
      if (!isRecord(recipient) || !isRecord(recipient.email_address)) continue;
      const address = recipient.email_address.address;
      if (typeof address === 'string' && address.includes('@')) {
        recipients.add(address.trim().toLowerCase());
      }
    }
  }

  return Array.from(recipients);
}

function isAuthorized(request: NextRequest, secret: string): boolean {
  const supplied = request.headers.get('x-zeptomail-webhook-secret');
  if (!supplied) return false;

  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ZeptoMail sends the secret configured under Agent → Webhooks →
// Authorization headers. Hard bounces and feedback-loop complaints are both
// permanent reasons to stop sending to that recipient across the platform.
export async function POST(request: NextRequest) {
  const secret = process.env.ZEPTOMAIL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ZeptoMail webhook: ZEPTOMAIL_WEBHOOK_SECRET not configured.');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isRecord(payload)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const events = values(payload.event_name)
    .filter((event): event is string => typeof event === 'string')
    .map((event) => event.toLowerCase().replace(/[\s_-]/g, ''));
  const permanentFailure = events.some((event) =>
    event === 'hardbounce' || event === 'feedbackloop'
  );

  // ZeptoMail can be configured to send several event types to one endpoint.
  // Acknowledge unrelated events without changing any contact records.
  if (!permanentFailure) return NextResponse.json({ received: true, suppressed: 0 });

  const recipients = extractRecipients(payload);
  if (recipients.length === 0) {
    console.error('ZeptoMail webhook: permanent-failure event contained no recipient.');
    return NextResponse.json({ received: true, suppressed: 0 });
  }

  const supabase = getServerSupabase();
  const invalidAt = new Date().toISOString();
  const updates = await Promise.all(recipients.map(async (email) =>
    supabase.from('people').update({ email_invalid_at: invalidAt }).ilike('email', email)
  ));
  const error = updates.find((result) => result.error)?.error;

  if (error) {
    console.error('ZeptoMail webhook: failed to suppress recipients:', error.message);
    return NextResponse.json({ error: 'Could not suppress recipients' }, { status: 500 });
  }

  return NextResponse.json({ received: true, suppressed: recipients.length });
}
