import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { formatPersonName, validatePersonIdentity } from '@/lib/personIdentity';
import { kioskCodeMatches } from '@/lib/confirmCode';

export const dynamic = 'force-dynamic';

// GET - List people (subscription enforced)
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('people')
      .select('*')
      .eq('org_id', auth.session.orgId)
      .order('full_name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ people: data });
  } catch (error) {
    console.error('People GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Add person (subscription enforced)
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();

    const { full_name, phone, gender, email, role, date_of_birth, occupation, company, location, how_found_us, notes, photo_url } = body;

    const identityError = validatePersonIdentity(full_name, phone);
    if (identityError) return NextResponse.json({ error: identityError }, { status: 400 });

    const { data, error } = await supabase
      .from('people')
      .insert({
        org_id: auth.session.orgId,
        full_name: formatPersonName(full_name),
        phone: phone.trim(),
        gender: gender || null,
        email: email?.trim() || null,
        role: role || 'visitor',
        date_of_birth: date_of_birth || null,
        occupation: occupation || null,
        company: company || null,
        location: location || null,
        how_found_us: how_found_us || null,
        notes: notes || null,
        photo_url: photo_url || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A person with this phone number already exists' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, person: data });
  } catch (error) {
    console.error('People POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH - Update or archive person (subscription enforced)
export async function PATCH(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const { personId, action, updates } = body;

    if (!personId) {
      return NextResponse.json({ error: 'Person ID is required' }, { status: 400 });
    }

    if (action === 'archive') {
      const { error } = await supabase
        .from('people')
        .update({ archived: true })
        .eq('id', personId)
        .eq('org_id', auth.session.orgId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (action === 'restore') {
      const { error } = await supabase
        .from('people')
        .update({ archived: false })
        .eq('id', personId)
        .eq('org_id', auth.session.orgId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (updates) {
      if (updates.full_name !== undefined && String(updates.full_name).trim().toLocaleLowerCase() === String(updates.full_name).trim().toLocaleUpperCase()) {
        return NextResponse.json({ error: 'Enter a name that includes letters' }, { status: 400 });
      }
      if (updates.phone !== undefined && String(updates.phone).replace(/\D/g, '').length < 7) {
        return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 });
      }
      const allowedKeys = new Set([
        'full_name', 'phone', 'gender', 'email', 'date_of_birth',
        'occupation', 'company', 'location', 'how_found_us',
        'notes', 'role', 'archived', 'photo_url'
      ]);
      const safeUpdates = Object.fromEntries(
        Object.entries(updates).filter(([key]) => allowedKeys.has(key))
      );

      if (typeof safeUpdates.full_name === 'string') safeUpdates.full_name = formatPersonName(safeUpdates.full_name);
      if (typeof safeUpdates.phone === 'string') safeUpdates.phone = safeUpdates.phone.trim();

      if (Object.keys(safeUpdates).length === 0) {
        return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 });
      }

      const { error } = await supabase
        .from('people')
        .update(safeUpdates)
        .eq('id', personId)
        .eq('org_id', auth.session.orgId);

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'A person with this phone number already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'No action or updates provided' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('People PATCH error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Permanently delete person (subscription enforced)
export async function DELETE(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get('id');

    if (!personId) {
      return NextResponse.json({ error: 'Person ID is required' }, { status: 400 });
    }

    const supabase = getServerSupabase();

    // Same real kiosk-PIN gate as Groups, Categories, Services, and Giving —
    // deleting a person's full history (attendance, group memberships) is at
    // least as irreversible as any of those, so it shouldn't be the one
    // deletion route in the app that only needs the public word "DELETE"
    // typed instead of the church's own secret code.
    const gate = await kioskCodeMatches(supabase, auth.session.orgId, searchParams.get('code'));
    if (!gate.ok) {
      return NextResponse.json({ error: 'Enter your kiosk code to confirm deletion.' }, { status: 403 });
    }

    const { error } = await supabase
      .from('people')
      .delete()
      .eq('id', personId)
      .eq('org_id', auth.session.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('People DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
