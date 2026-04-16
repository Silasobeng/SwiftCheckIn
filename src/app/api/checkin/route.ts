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
