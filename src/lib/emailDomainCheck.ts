import dns from 'dns/promises';

// Catches the far more common failure mode than deliberate fakery: a typo
// under pressure at a busy kiosk ("gmial.com", "yaho.com") or a made-up
// domain someone mashes in to avoid giving a real address. It cannot catch
// a fake mailbox at a real domain ("whoever@gmail.com") — that needs either
// SMTP-level probing (unreliable against major providers by design, since
// they deliberately don't reveal which mailboxes exist) or a confirmation-
// link round trip, which is exactly the walk-up friction this app avoids.
// This is one layer, not the whole defense — the bounce webhook (see
// /api/webhooks/resend) is what catches everything this can't, after the
// fact rather than before.
export type DomainCheckResult = 'ok' | 'no-mail-server' | 'unknown';

const TIMEOUT_MS = 2500;

export async function checkEmailDomain(email: string): Promise<DomainCheckResult> {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  if (!domain) return 'unknown';

  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('MX lookup timed out'), { code: 'TIMEOUT' })), TIMEOUT_MS)
      ),
    ]);
    return records.length > 0 ? 'ok' : 'no-mail-server';
  } catch (err) {
    // ENOTFOUND / ENODATA are Node's real, definitive "this domain has no
    // mail server" answers. Anything else — a timeout, a resolver hiccup,
    // SERVFAIL — is inconclusive, and inconclusive must never block a real
    // check-in, so it's treated the same as "looks fine."
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return 'no-mail-server';
    return 'unknown';
  }
}
