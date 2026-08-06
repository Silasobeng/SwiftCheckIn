import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { kioskCodeMatches } from '@/lib/confirmCode';

export const dynamic = 'force-dynamic';

// GET - List this church's group categories (subscription enforced)
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('group_categories')
      .select('*')
      .eq('org_id', auth.session.orgId)
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories: data });
  } catch (error) {
    console.error('Group categories GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Create a category (subscription enforced)
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const { name } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'A name is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('group_categories')
      .insert({ org_id: auth.session.orgId, name: String(name).trim() })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A category with this name already exists' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, category: data });
  } catch (error) {
    console.error('Group categories POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Remove a category. Its groups (and everyone's membership in
// them) go with it — that cascade is real data loss, so it's gated on the
// kiosk code same as every other destructive action (subscription enforced).
export async function DELETE(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('id');

    if (!categoryId) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const gate = await kioskCodeMatches(supabase, auth.session.orgId, searchParams.get('code'));
    if (!gate.ok) {
      return NextResponse.json({ error: 'Enter your kiosk code to confirm deletion.' }, { status: 403 });
    }

    const { error } = await supabase
      .from('group_categories')
      .delete()
      .eq('id', categoryId)
      .eq('org_id', auth.session.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Group categories DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
