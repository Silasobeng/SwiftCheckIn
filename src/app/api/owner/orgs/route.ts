import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireOwner();
  if ('error' in auth) return auth.error;

  const supabase = getServerSupabase();
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, slug, admin_email, subscription_status, subscription_end_date, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orgIds = (orgs || []).map((o) => o.id);
  const [peopleRes, servicesRes, checkinsRes] = await Promise.all([
    orgIds.length ? supabase.from('people').select('org_id').in('org_id', orgIds) : Promise.resolve({ data: [] as { org_id: string }[] }),
    orgIds.length ? supabase.from('services').select('org_id').in('org_id', orgIds) : Promise.resolve({ data: [] as { org_id: string }[] }),
    orgIds.length ? supabase.from('checkins').select('org_id').in('org_id', orgIds) : Promise.resolve({ data: [] as { org_id: string }[] }),
  ]);

  const countBy = (rows: { org_id: string }[] | null | undefined) =>
    (rows || []).reduce<Record<string, number>>((acc, row) => {
      acc[row.org_id] = (acc[row.org_id] || 0) + 1;
      return acc;
    }, {});

  const peopleBy = countBy(peopleRes.data as { org_id: string }[]);
  const servicesBy = countBy(servicesRes.data as { org_id: string }[]);
  const checkinsBy = countBy(checkinsRes.data as { org_id: string }[]);

  return NextResponse.json({
    orgs: (orgs || []).map((org) => ({
      ...org,
      counts: {
        people: peopleBy[org.id] || 0,
        services: servicesBy[org.id] || 0,
        checkins: checkinsBy[org.id] || 0,
      },
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireOwner();
  if ('error' in auth) return auth.error;

  try {
    const { orgId, action } = await request.json();
    if (!orgId || !action) {
      return NextResponse.json({ error: 'orgId and action are required' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    let update: Record<string, unknown> = {};
    const now = new Date();
    if (action === 'extend_30_days') {
      const { data: org } = await supabase.from('organizations').select('subscription_end_date').eq('id', orgId).single();
      const base = org?.subscription_end_date ? new Date(`${org.subscription_end_date}T00:00:00Z`) : new Date(now);
      if (base < now) base.setTime(now.getTime());
      base.setUTCDate(base.getUTCDate() + 30);
      update = { subscription_status: 'active', subscription_end_date: base.toISOString().slice(0, 10) };
    } else if (action === 'mark_expired') {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      update = { subscription_status: 'expired', subscription_end_date: yesterday.toISOString().slice(0, 10) };
    } else if (action === 'mark_trial') {
      const end = new Date();
      end.setUTCDate(end.getUTCDate() + 14);
      update = { subscription_status: 'trial', subscription_end_date: end.toISOString().slice(0, 10) };
    } else if (action === 'activate_annual') {
      const end = new Date();
      end.setUTCDate(end.getUTCDate() + 365);
      update = { subscription_status: 'active', subscription_plan: 'annual', subscription_end_date: end.toISOString().slice(0, 10) };
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { error } = await supabase.from('organizations').update(update).eq('id', orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Owner org patch error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOwner();
  if ('error' in auth) return auth.error;

  const orgId = request.nextUrl.searchParams.get('orgId');
  const confirm = request.nextUrl.searchParams.get('confirm');
  if (!orgId || confirm !== 'DELETE') {
    return NextResponse.json({ error: 'orgId and confirm=DELETE are required' }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const { error } = await supabase.from('organizations').delete().eq('id', orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
