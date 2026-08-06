import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET - Every person/group membership pair for this org, as a flat list.
// The client builds its own person -> groups[] map from this rather than
// each endpoint trying to embed the other — same flat-and-stitched pattern
// already used for services/people/checkins (subscription enforced).
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    // people_groups has no org_id of its own — scoped through a join to
    // groups, which does.
    const { data, error } = await supabase
      .from('people_groups')
      .select('person_id, group_id, groups!inner(org_id)')
      .eq('groups.org_id', auth.session.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memberships: (data||[]).map(r => ({ person_id: r.person_id, group_id: r.group_id })) });
  } catch (error) {
    console.error('People-groups GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Replace one person's full set of group memberships. Sent as a
// complete list rather than incremental add/remove calls because that's how
// the edit form and the bulk-assign action both naturally produce it: "here
// is everything this person should belong to now" (subscription enforced).
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const { personId, groupIds } = body;

    if (!personId || !Array.isArray(groupIds)) {
      return NextResponse.json({ error: 'personId and groupIds are required' }, { status: 400 });
    }

    // Confirm the person belongs to this org before touching anything —
    // otherwise an org_id-less table like this one would let one church
    // rewrite another's membership rows by guessing a person id.
    const { data: person } = await supabase
      .from('people')
      .select('id')
      .eq('id', personId)
      .eq('org_id', auth.session.orgId)
      .maybeSingle();
    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    // Same check for every group id being assigned — a group from another
    // org must be silently dropped, not accepted.
    let validGroupIds: string[] = [];
    if (groupIds.length > 0) {
      const { data: validGroups } = await supabase
        .from('groups')
        .select('id')
        .eq('org_id', auth.session.orgId)
        .in('id', groupIds);
      validGroupIds = (validGroups||[]).map(g => g.id);
    }

    const { error: deleteError } = await supabase
      .from('people_groups')
      .delete()
      .eq('person_id', personId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (validGroupIds.length > 0) {
      const { error: insertError } = await supabase
        .from('people_groups')
        .insert(validGroupIds.map(group_id => ({ person_id: personId, group_id })));
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('People-groups POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
