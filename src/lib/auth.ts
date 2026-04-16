import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { AuthSession, Organization } from '@/types';
import { getServerSupabase, isSubscriptionValid } from './supabase';

// =============================================================
// HARDENED AUTH - NO FALLBACK SECRETS
// =============================================================

const COOKIE_NAME = 'swiftcheckin_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getOwnerEmails(): string[] {
  return (process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getOwnerEmails().includes(email.toLowerCase());
}

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


/**
 * Validate session and ensure the logged-in user is the platform owner.
 */
export async function requireOwner(): Promise<
  { session: AuthSession } | { error: NextResponse }
> {
  const auth = await requireAuth();
  if ('error' in auth) return auth;

  if (!isOwnerEmail(auth.session.adminEmail)) {
    return {
      error: NextResponse.json({ error: 'Owner access required' }, { status: 403 }),
    };
  }

  return auth;
}
