// =============================================================
// OFFLINE CHECK-IN QUEUE
// =============================================================
// The kiosk is a tablet that sits on one screen for an entire service — it
// never navigates away — so it doesn't need a full offline-first PWA shell.
// It needs two things: the last-known people/service list cached so the
// screen can still render when the network drops, and a queue for check-ins
// that couldn't reach the server, retried until they land.
//
// Retrying is safe by construction: /api/kiosk looks an existing person up by
// phone before creating one, and upserts the check-in row on
// (org_id, person_id, service_id) — so the same queued item flushed twice
// never creates a duplicate person or a duplicate check-in.
//
// Scoped per org slug so a kiosk that switches churches (unlikely, but the
// route allows it) never mixes queues.

export interface QueuedCheckin {
  clientId: string;
  orgSlug: string;
  serviceId: string;
  personId?: string;
  newPerson?: { full_name: string; phone: string; gender?: string; email?: string };
  personLabel: string; // display name, so a queued item can be listed without re-reading cached people
  queuedAt: number;
}

interface CachedKiosk {
  data: unknown;
  cachedAt: number;
}

const QUEUE_KEY = (slug: string) => `swiftcheckin_queue_${slug}`;
const CACHE_KEY = (slug: string) => `swiftcheckin_cache_${slug}`;

// The cached snapshot is only trustworthy for a limited window. Beyond this,
// stale data (a kiosk code changed, a subscription lapsed, a service ended)
// is more dangerous than showing "no connection" outright.
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours — comfortably covers one service

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function getQueue(slug: string): QueuedCheckin[] {
  if (typeof window === 'undefined') return [];
  return safeParse<QueuedCheckin[]>(window.localStorage.getItem(QUEUE_KEY(slug))) ?? [];
}

function setQueue(slug: string, items: QueuedCheckin[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(QUEUE_KEY(slug), JSON.stringify(items));
}

export function enqueueCheckin(slug: string, item: Omit<QueuedCheckin, 'clientId' | 'orgSlug' | 'queuedAt'>): QueuedCheckin {
  const full: QueuedCheckin = {
    ...item,
    clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    orgSlug: slug,
    queuedAt: Date.now(),
  };
  setQueue(slug, [...getQueue(slug), full]);
  return full;
}

export function removeFromQueue(slug: string, clientId: string): void {
  setQueue(slug, getQueue(slug).filter((q) => q.clientId !== clientId));
}

export function cacheKioskData(slug: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  const entry: CachedKiosk = { data, cachedAt: Date.now() };
  window.localStorage.setItem(CACHE_KEY(slug), JSON.stringify(entry));
}

/** Returns the cached snapshot only if it is still within the trust window. */
export function getCachedKioskData<T>(slug: string): T | null {
  if (typeof window === 'undefined') return null;
  const entry = safeParse<CachedKiosk>(window.localStorage.getItem(CACHE_KEY(slug)));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_MAX_AGE_MS) return null;
  return entry.data as T;
}

/** True only for a genuine network failure — fetch throwing because the
 *  device cannot reach the server at all. A real HTTP error response (4xx,
 *  5xx) is not this: the request reached the server and the server said no,
 *  which retrying will not fix. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}
