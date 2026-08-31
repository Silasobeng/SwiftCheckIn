import { NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// One-off — reads raw counts straight from the database for this org,
// bypassing the admin dashboard's own fetches entirely. Exists to answer
// one question fast: is data actually gone, or is the dashboard just
// failing to load/display what's still there. Remove after use.
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  const supabase = getServerSupabase();
  const orgId = auth.session.orgId;

  const [people, activePeople, services, checkins, org] = await Promise.all([
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('archived', false),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('organizations').select('id, name, slug').eq('id', orgId).single(),
  ]);

  return NextResponse.json({
    org: org.data,
    counts: {
      people_total: people.count,
      people_active: activePeople.count,
      services_total: services.count,
      checkins_total: checkins.count,
    },
    errors: {
      people: people.error?.message,
      activePeople: activePeople.error?.message,
      services: services.error?.message,
      checkins: checkins.error?.message,
      org: org.error?.message,
    },
  });
}
