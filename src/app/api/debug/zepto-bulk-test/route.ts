import { NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COUNT = 105;

// One-off — sends COUNT real emails through ZeptoMail directly (bypassing
// Resend/Brevo), all to the logged-in admin's own address, to settle
// definitively whether the review-pending 100/day cap is actually lifted
// rather than inferring it from the dashboard's wording changing. A small
// delay between sends avoids tripping an unrelated per-second rate limit
// that could be mistaken for the daily cap being tested. Remove after use.
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  const rawKey = process.env.ZEPTOMAIL_API_KEY;
  if (!rawKey) return NextResponse.json({ error: 'ZeptoMail not configured' }, { status: 500 });
  const apiKey = rawKey.replace(/^Zoho-enczapikey\s+/i, '');
  const to = auth.session.adminEmail;
  const from = process.env.RESEND_FROM_EMAIL || 'noreply@wemotiply.com';

  const BATCH_SIZE = 20;
  let succeeded = 0;
  let firstFailureAt: number | null = null;
  let firstFailureDetail: string | null = null;

  const sendOne = async (i: number) => {
    const res = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: { Authorization: `Zoho-enczapikey ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: { address: from, name: 'WeMotiply' },
        to: [{ email_address: { address: to, name: to } }],
        subject: `WeMotiply — bulk cap test ${i}/${COUNT}`,
        htmlbody: `<p>Test email ${i} of ${COUNT}, confirming whether the 100/day cap is actually lifted.</p>`,
      }),
    });
    if (res.ok) return { i, ok: true as const };
    return { i, ok: false as const, detail: `${res.status} ${(await res.text()).slice(0, 300)}` };
  };

  for (let start = 1; start <= COUNT; start += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, COUNT - start + 1) }, (_, k) => start + k);
    const results = await Promise.all(batch.map(sendOne));
    for (const r of results.sort((a, b) => a.i - b.i)) {
      if (r.ok) { succeeded++; }
      else if (firstFailureAt === null) { firstFailureAt = r.i; firstFailureDetail = r.detail; }
    }
  }

  return NextResponse.json({ requested: COUNT, succeeded, firstFailureAt, firstFailureDetail });
}
