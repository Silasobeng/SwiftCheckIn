import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { AuthSession, Organization } from '@/types';
import { getServerSupabase, isSubscriptionValid } from './supabase';

// =============================================================
// HARDENED AUTH - NO FALLBACK SECRETS
// =============================================================

const COOKIE_NAME = 'swiftcheckin_session';
const OWNER_COOKIE_NAME = 'swiftcheckin_owner';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const OWNER_COOKIE_MAX_AGE = 60 * 60 * 12; // 12 hours — the owner portal is high-privilege

/**
 * Get the JWT secret key.
 * CRASHES if not configured - no fallback allowed in production.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is not configured. ' +
      'This is required for authentication. ' +
      'Generate a secure random string of at least 32 characters.'
    );
  }

  if (secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long for security.'
    );
  }

  return new TextEncoder().encode(secret);
}

/**
 * Create a new session token for an organization.
 */
export async function createSession(org: Organization): Promise<string> {
  const session: AuthSession = {
    orgId: org.id,
    orgName: org.name,
    orgSlug: org.slug,
    adminEmail: org.admin_email,
    subscriptionStatus: org.subscription_status,
    subscriptionEndDate: org.subscription_end_date,
    exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE,
  };

  const token = await new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecretKey());

  return token;
}

/**
 * Get the current session from cookies.
 * Returns null if no valid session exists.
 */
export async function getSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as AuthSession;
  } catch {
    return null;
  }
}

/**
 * Set the session cookie.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Clear the session cookie.
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// =============================================================
// PROTECTED ROUTE GUARD - SUBSCRIPTION ENFORCEMENT
// =============================================================

export interface ProtectedSession extends AuthSession {
  isSubscriptionActive: boolean;
}

/**
 * Validate session and check subscription status.
 * Use this at the start of every protected API route.
 * 
 * Returns:
 * - session data if valid and subscription active
 * - NextResponse error if invalid or expired
 */
export async function requireActiveSubscription(): Promise<
  { session: ProtectedSession } | { error: NextResponse }
> {
  const session = await getSession();

  if (!session) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  // Refresh subscription status from database
  const supabase = getServerSupabase();
  const { data: org, error } = await supabase
    .from('organizations')
    .select('subscription_status, subscription_end_date')
    .eq('id', session.orgId)
    .single();

  if (error || !org) {
    return {
      error: NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      ),
    };
  }

  const isActive = isSubscriptionValid(
    org.subscription_status,
    org.subscription_end_date
  );

  if (!isActive) {
    return {
      error: NextResponse.json(
        { 
          error: 'Subscription expired',
          code: 'SUBSCRIPTION_EXPIRED',
          message: 'Your subscription has expired. Please renew to continue using SwiftCheckIn.'
        },
        { status: 403 }
      ),
    };
  }

  return {
    session: {
      ...session,
      subscriptionStatus: org.subscription_status,
      subscriptionEndDate: org.subscription_end_date,
      isSubscriptionActive: true,
    },
  };
}

/**
 * Validate session only (no subscription check).
 * Use for read-only routes where expired accounts can still view data.
 */
export async function requireAuth(): Promise<
  { session: AuthSession } | { error: NextResponse }
> {
  const session = await getSession();

  if (!session) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  return { session };
}


// =============================================================
// OWNER PORTAL — STANDALONE PASSWORD, NOT TIED TO ANY CHURCH
// =============================================================
// The developer/owner portal spans every church, so it deliberately has its
// own single-password gate and its own short-lived cookie, independent of any
// church admin login. There is no "owner" church account any more.

/** Constant-time comparison so the password check can't be timed. */
function safeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Compare against a fixed-length digest so differing lengths don't leak.
  if (ab.length !== bb.length) {
    // Still walk b to keep timing flat, then fail.
    let acc = 1;
    for (let i = 0; i < bb.length; i++) acc |= bb[i];
    return acc === 0 && ab.length === bb.length;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** True when the supplied password matches OWNER_PORTAL_PASSWORD. */
export function verifyOwnerPassword(password: string): boolean {
  const expected = process.env.OWNER_PORTAL_PASSWORD;
  if (!expected || expected.length < 8) {
    // Refuse to authenticate against a missing or weak secret rather than
    // silently allowing access.
    return false;
  }
  if (typeof password !== 'string' || password.length === 0) return false;
  return safeEqual(password, expected);
}

export async function createOwnerToken(): Promise<string> {
  return new SignJWT({ role: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getSecretKey());
}

export async function setOwnerCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OWNER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: OWNER_COOKIE_MAX_AGE,
    path: '/',
  });
}

export async function clearOwnerCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(OWNER_COOKIE_NAME);
}

async function getOwnerSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(OWNER_COOKIE_NAME)?.value;
    if (!token) return false;
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.role === 'owner';
  } catch {
    return false;
  }
}

/**
 * Guard for owner-portal API routes. Requires a valid owner cookie — nothing
 * to do with church sessions.
 */
export async function requireOwner(): Promise<{ ok: true } | { error: NextResponse }> {
  const isOwner = await getOwnerSession();
  if (!isOwner) {
    return { error: NextResponse.json({ error: 'Owner access required' }, { status: 401 }) };
  }
  return { ok: true };
}

/** For the owner page to check whether a password prompt is needed. */
export async function isOwnerAuthenticated(): Promise<boolean> {
  return getOwnerSession();
}
