// =============================================================
// RATE LIMITING - IN-MEMORY STORE
// =============================================================
// For production at scale, replace with Redis or similar.
// This in-memory store works for single-instance deployments.
// =============================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically. Avoid iterator issues in some TS builds.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  });
}, 60000);

// Prevent this timer from keeping Node alive in serverless contexts.
(cleanupTimer as NodeJS.Timeout).unref?.();

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request should be rate limited.
 * 
 * @param key - Unique identifier (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed and remaining quota
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSec * 1000;
  const entry = store.get(key);

  // No existing entry or window expired
  if (!entry || entry.resetAt < now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: now + windowMs,
    };
  }

  // Within window, check count
  if (entry.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

// =============================================================
// PRESET CONFIGURATIONS
// =============================================================

export const RATE_LIMITS = {
  /** Login: 5 attempts per minute per IP */
  login: { limit: 5, windowSec: 60 },
  
  /** Signup: 3 attempts per minute per IP */
  signup: { limit: 3, windowSec: 60 },
  
  /** Kiosk check-in: 200 per minute per org.
   *
   *  This is an abuse ceiling, NOT a throttle on real traffic. It is keyed per
   *  ORG, so every tablet a church runs shares one budget, and the whole
   *  congregation arrives inside the same 10-15 minutes on a Sunday — a
   *  400-member church with three tablets can genuinely burst past 30/min
   *  during the rush. Tripping it shows a visitor "Too many check-ins" at the
   *  door, which is the single worst moment in the product to fail, so the
   *  ceiling sits far above any plausible real Sunday and only catches a
   *  script hammering the endpoint. */
  checkin: { limit: 200, windowSec: 60 },
  
  /** API general: 100 requests per minute per org */
  api: { limit: 100, windowSec: 60 },
} as const;

/**
 * Get client IP from request headers.
 * Works with Vercel's x-forwarded-for header.
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}
