import type { SupabaseClient } from '@supabase/supabase-js';

// Shared gate for destructive admin actions. A church confirms a delete by
// typing its kiosk access code — the same short code ushers already use to
// unlock the tablet — so accidental or casual deletion is prevented without a
// second password to remember.
//
// If the church has cleared its kiosk code, there is nothing to check, so the
// delete proceeds (the admin is already authenticated for their own org).
export async function kioskCodeMatches(
  supabase: SupabaseClient,
  orgId: string,
  code: unknown
): Promise<{ ok: boolean; noCodeSet?: boolean }> {
  const { data } = await supabase
    .from('app_settings')
    .select('kiosk_access_code')
    .eq('org_id', orgId)
    .maybeSingle();

  const expected = data?.kiosk_access_code;
  if (!expected) return { ok: true, noCodeSet: true };

  if (typeof code === 'string' && code.trim().toLowerCase() === expected.trim().toLowerCase()) {
    return { ok: true };
  }
  return { ok: false };
}
