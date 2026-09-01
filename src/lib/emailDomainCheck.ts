import dns from 'dns/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import disposableDomains from '@/data/disposable-email-domains.json';

// A maintained open-source list (disposable-email-domains project, ~8,700
// entries) of domains that exist specifically to give out a working-but-
// throwaway address — mailinator.com, 10minutemail.com, and the like. These
// all have perfectly valid MX records, so the MX check below can't catch
// them; this is a different failure mode entirely (deliberate avoidance,
// not a typo) and needs its own check.
const DISPOSABLE_DOMAINS = new Set<string>(disposableDomains as string[]);

export function isDisposableEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  return !!domain && DISPOSABLE_DOMAINS.has(domain);
}

// The bounce webhook already flags an address as invalid platform-wide, not
// per-church, the moment it hard-bounces anywhere — because a dead mailbox
// is dead everywhere. Right now that only suppresses *future* automated
// sends. This lets the kiosk ask the same question one step earlier: has
// this exact address already proven itself bad for some other church,
// before we even try it again for this one? No DNS lookup, no external
// call — just a lookup against data already sitting in our own database.
export async function wasEmailPreviouslyBounced(supabase: SupabaseClient, email: string): Promise<boolean> {
  const { data } = await supabase
    .from('people')
    .select('id')
    .ilike('email', email.trim())
    .not('email_invalid_at', 'is', null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

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
