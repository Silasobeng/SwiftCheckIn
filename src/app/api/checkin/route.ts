import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET - List checkins (subscription enforced)
export async function GET(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');
    const since = searchParams.get('since');
    // Default limit (300) is fine for the small recent-activity views this
    // was originally built for, but the admin dashboard's analytics —
    // monthly trends, retention, year-over-year — reuse this same fetch
    // over the org's FULL check-in history with no date filter. A church
    // doing a few hundred check-ins a month blows past 300 rows within
    // weeks, at which point those trend charts silently go quietly wrong
    // (fewer months than claimed, thin/misleading bars) with no error
    // anywhere. The `since` param lets a caller ask for a bounded date
    // window instead of a bounded row count, so analytics can request
    // "everything from the last two years" and actually get it regardless
    // of how large the congregation is.
    const limit = parseInt(searchParams.get('limit') || '300');

    const supabase = getServerSupabase();
    let query = supabase
      .from('checkins')
      .select('*, person:people(*), service:services(*)')
      .eq('org_id', auth.session.orgId)
      .order('checked_in_at', { ascending: false })
      .limit(limit);

    if (serviceId) {
      query = query.eq('service_id', serviceId);
    }
    if (since) {
      query = query.gte('checked_in_at', since);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ checkins: data });
  } catch (error) {
    console.error('Checkins GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
