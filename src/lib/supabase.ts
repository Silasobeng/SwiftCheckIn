import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================
// DUAL CLIENT PATTERN - HARDENED
// =============================================================
// 1. Server client uses SERVICE_ROLE_KEY - bypasses RLS, full access
// 2. Browser client uses ANON_KEY - restricted by RLS policies
// =============================================================

let _serverClient: SupabaseClient | null = null;
let _browserClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client with SERVICE_ROLE privileges.
 * This bypasses RLS and has full database access.
 * ONLY use in API routes and server components.
 */
export function getServerSupabase(): SupabaseClient {
  if (!_serverClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
    }

    if (!serviceRoleKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
        'This is required for server-side database access. ' +
        'Get it from Supabase Dashboard > Settings > API > service_role key'
      );
    }

    _serverClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _serverClient;
}

/**
 * Browser-side Supabase client with ANON_KEY.
 * This is restricted by RLS policies.
 * Currently only used for public org lookup by slug.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (!_browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      throw new Error('Supabase browser credentials not configured');
    }

    _browserClient = createClient(url, anonKey);
  }
  return _browserClient;
}

// =============================================================
// HELPER FUNCTIONS
// =============================================================

export function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function nowTimeValue(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Check if an organization has an active subscription.
 * Returns true if status is active/trial AND not expired.
 */
export function isSubscriptionValid(
  status: string,
  endDate: string | null
): boolean {
  if (status !== 'active' && status !== 'trial') {
    return false;
  }
  if (!endDate) {
    return true;
  }

  const expiry = new Date(`${endDate}T23:59:59.999Z`);
  return expiry.getTime() >= Date.now();
}
