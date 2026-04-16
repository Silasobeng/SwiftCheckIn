import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET - Get app settings (subscription enforced)
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('app_settings')
      .select('*, active_service:services(*)')
      .eq('org_id', auth.session.orgId)
      .maybeSingle();

    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('name, tagline, host_names, address, phone, email, logo_url, cover_image_url, brand_color, kiosk_welcome_heading, kiosk_welcome_subtext')
      .eq('id', auth.session.orgId)
      .single();

    if (error || orgError) {
      return NextResponse.json({ error: error?.message || orgError?.message }, { status: 500 });
    }

    return NextResponse.json({ settings: { ...data, organization } });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH - Update kiosk settings (subscription enforced)
export async function PATCH(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const { kiosk_open, active_service_id, org_name, tagline, host_names, address, phone, email, logo_url, cover_image_url, brand_color, kiosk_welcome_heading, kiosk_welcome_subtext } = body;

    // If opening kiosk, ensure there's an active service
    if (kiosk_open && !active_service_id) {
      const { data: settings } = await supabase
        .from('app_settings')
        .select('active_service_id')
        .eq('org_id', auth.session.orgId)
        .maybeSingle();

      if (!settings?.active_service_id) {
        // Auto-create today's service
        const today = new Date().toISOString().split('T')[0];
        const { data: newService } = await supabase
          .from('services')
          .insert({
            org_id: auth.session.orgId,
            service_date: today,
            title: "Today's Service",
            is_active: true,
          })
          .select()
          .single();

        if (newService) {
          await supabase
            .from('app_settings')
            .upsert({
              org_id: auth.session.orgId,
              kiosk_open: true,
              active_service_id: newService.id,
            });

          return NextResponse.json({ success: true, autoCreatedService: newService });
        }
      }
    }


    if (active_service_id !== undefined && active_service_id !== null) {
      const { data: service, error: serviceError } = await supabase
        .from('services')
        .select('id')
        .eq('id', active_service_id)
        .eq('org_id', auth.session.orgId)
        .maybeSingle();

      if (serviceError || !service) {
        return NextResponse.json({ error: 'Invalid active service' }, { status: 400 });
      }
    }

    // Update settings
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof kiosk_open === 'boolean') updateData.kiosk_open = kiosk_open;
    if (active_service_id !== undefined) updateData.active_service_id = active_service_id;

    const { error } = await supabase
      .from('app_settings')
      .upsert({
        org_id: auth.session.orgId,
        ...updateData,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orgUpdateData: Record<string, unknown> = {}
    const orgFields: Record<string, unknown> = { tagline, host_names, address, phone, email, logo_url, cover_image_url, brand_color, kiosk_welcome_heading, kiosk_welcome_subtext };
    // Handle org name separately (it's 'name' in DB)
    if (org_name !== undefined && org_name.trim()) orgUpdateData['name'] = org_name.trim();
    Object.entries(orgFields).forEach(([key, value]) => {
      if (value !== undefined) orgUpdateData[key] = value === '' ? null : value;
    });

    if (Object.keys(orgUpdateData).length) {
      const { error: orgUpdateError } = await supabase
        .from('organizations')
        .update({ ...orgUpdateData, updated_at: new Date().toISOString() })
        .eq('id', auth.session.orgId);

      if (orgUpdateError) {
        return NextResponse.json({ error: orgUpdateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Settings PATCH error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
