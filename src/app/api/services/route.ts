import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { kioskCodeMatches } from '@/lib/confirmCode';

export const dynamic = 'force-dynamic';

// GET - List services (subscription enforced)
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('org_id', auth.session.orgId)
      .order('service_date', { ascending: false })
      .order('service_time', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ services: data });
  } catch (error) {
    console.error('Services GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Create service (subscription enforced)
export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();

    const { service_date, service_time, title, theme, scripture, message } = body;

    if (!service_date) {
      return NextResponse.json({ error: 'Service date is required' }, { status: 400 });
    }

    // Create the service
    const { data: service, error } = await supabase
      .from('services')
      .insert({
        org_id: auth.session.orgId,
        service_date,
        service_time: service_time || null,
        title: title || null,
        theme: theme || null,
        scripture: scripture || null,
        message: message || null,
        is_active: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deactivate all other services and activate this one
    await supabase
      .from('services')
      .update({ is_active: false })
      .eq('org_id', auth.session.orgId);

    await supabase
      .from('services')
      .update({ is_active: true })
      .eq('id', service.id);

    // Update app settings
    await supabase
      .from('app_settings')
      .upsert({
        org_id: auth.session.orgId,
        active_service_id: service.id,
        kiosk_open: false,
      });

    return NextResponse.json({ success: true, service });
  } catch (error) {
    console.error('Services POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH - Update service or set active (subscription enforced)
export async function PATCH(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const { serviceId, setActive, updates } = body;

    if (!serviceId) {
      return NextResponse.json({ error: 'Service ID is required' }, { status: 400 });
    }

    const { data: existingService, error: serviceLookupError } = await supabase
      .from('services')
      .select('id')
      .eq('id', serviceId)
      .eq('org_id', auth.session.orgId)
      .maybeSingle();

    if (serviceLookupError || !existingService) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    if (setActive) {
      const { error: deactivateError } = await supabase
        .from('services')
        .update({ is_active: false })
        .eq('org_id', auth.session.orgId);

      if (deactivateError) {
        return NextResponse.json({ error: deactivateError.message }, { status: 500 });
      }

      const { error: activateError } = await supabase
        .from('services')
        .update({ is_active: true })
        .eq('id', serviceId)
        .eq('org_id', auth.session.orgId);

      if (activateError) {
        return NextResponse.json({ error: activateError.message }, { status: 500 });
      }

      const { error: settingsError } = await supabase
        .from('app_settings')
        .upsert({
          org_id: auth.session.orgId,
          active_service_id: serviceId,
        });

      if (settingsError) {
        return NextResponse.json({ error: settingsError.message }, { status: 500 });
      }
    }

    if (updates) {
      const allowedKeys = new Set(['service_date', 'service_time', 'title', 'theme', 'scripture', 'message']);
      const safeUpdates = Object.fromEntries(
        Object.entries(updates).filter(([key]) => allowedKeys.has(key))
      );

      if (Object.keys(safeUpdates).length === 0) {
        return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 });
      }

      const { error: updateError } = await supabase
        .from('services')
        .update(safeUpdates)
        .eq('id', serviceId)
        .eq('org_id', auth.session.orgId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    if (!setActive && !updates) {
      return NextResponse.json({ error: 'No update requested' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Services PATCH error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Remove a service (and its check-ins). Gated by the kiosk code so a
// service can't be wiped by accident. If it was the active service, the kiosk's
// active_service_id is cleared automatically (ON DELETE SET NULL).
export async function DELETE(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('id');
    if (!serviceId) {
      return NextResponse.json({ error: 'Service ID is required' }, { status: 400 });
    }

    const supabase = getServerSupabase();

    const gate = await kioskCodeMatches(supabase, auth.session.orgId, searchParams.get('code'));
    if (!gate.ok) {
      return NextResponse.json({ error: 'Enter your kiosk code to confirm deletion.' }, { status: 403 });
    }

    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', serviceId)
      .eq('org_id', auth.session.orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Services DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
