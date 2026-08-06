import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { kioskCodeMatches } from '@/lib/confirmCode';

export const dynamic = 'force-dynamic';

// GET - List groups, with each group's leader attached (subscription enforced)
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('groups')
      // people!leader_person_id disambiguates which of the two FKs between
      // groups and people to embed through — groups.leader_person_id points
      // at people, and people.group_id points back at groups, so PostgREST
      // can't infer one from "people" alone.
      .select('*, leader:people!leader_person_id(id, full_name, phone)')
      .eq('org_id', auth.session.orgId)
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ groups: data });
  } catch (error) {
    console.error('Groups GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Create a group (subscription enforced)
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const { name, categoryId, leader_person_id } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'A name is required' }, { status: 400 });
    }
    if (!categoryId) {
      return NextResponse.json({ error: 'A category is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('groups')
      .insert({
        org_id: auth.session.orgId,
        category_id: categoryId,
        name: String(name).trim(),
        leader_person_id: leader_person_id || null,
      })
      .select('*, leader:people!leader_person_id(id, full_name, phone)')  // see GET's FK note
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A group with this name already exists' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, group: data });
  } catch (error) {
    console.error('Groups POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH - Rename a group or change its leader (subscription enforced)
export async function PATCH(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const { groupId, name, leader_person_id } = body;

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) {
      if (!String(name).trim()) {
        return NextResponse.json({ error: 'A name is required' }, { status: 400 });
      }
      updates.name = String(name).trim();
    }
    if (leader_person_id !== undefined) updates.leader_person_id = leader_person_id || null;

    const { error } = await supabase
      .from('groups')
      .update(updates)
      .eq('id', groupId)
      .eq('org_id', auth.session.orgId);

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A group with this name already exists' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Groups PATCH error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Remove a group. People in it are not deleted — only their
// membership row in that specific group goes away (subscription enforced).
export async function DELETE(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('id');

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID is required' }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const gate = await kioskCodeMatches(supabase, auth.session.orgId, searchParams.get('code'));
    if (!gate.ok) {
      return NextResponse.json({ error: 'Enter your kiosk code to confirm deletion.' }, { status: 403 });
    }

    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId)
      .eq('org_id', auth.session.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Groups DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
