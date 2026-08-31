import type { SupabaseClient } from '@supabase/supabase-js';

// Shared gate for destructive admin actions. A church confirms a delete by
// typing its kiosk access code — the same short code ushers already use to
// unlock the tablet — so accidental or casual deletion is prevented without a
// second password to remember.
//
// If the church has cleared its kiosk code, there's no PIN to check it
// against — but that used to mean skipping confirmation entirely, so a
// misclick on Delete (sitting right next to Edit in the People list) went
// straight through with nothing typed at all. The admin is already
// authenticated for their own org either way, so this was never about
// authorisation — it's purely a "did you mean to do this" speed bump, and
// that bump shouldn't disappear just because a church never set a PIN.
// Falls back to typing the literal word DELETE instead.
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
  const typed = typeof code === 'string' ? code.trim() : '';

  if (!expected) {
    return { ok: typed.toUpperCase() === 'DELETE', noCodeSet: true };
  }

  if (typed.toLowerCase() === expected.trim().toLowerCase()) {
    return { ok: true };
  }
  return { ok: false };
}
