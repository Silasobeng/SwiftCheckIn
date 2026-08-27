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
    // The access code is safe to return here — this route is behind the admin
    // session. It must never be added to the public /api/kiosk payload.
    const { data, error } = await supabase
      .from('app_settings')
      .select('*, active_service:services(*)')
      .eq('org_id', auth.session.orgId)
      .maybeSingle();

    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('name, tagline, host_names, address, phone, email, logo_url, cover_image_url, brand_color, kiosk_welcome_heading, kiosk_welcome_subtext, timezone, sms_credits, sms_welcome_enabled, sms_birthday_enabled, sms_missed_enabled, sms_sender_id')
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
    const { kiosk_open, active_service_id, org_name, tagline, host_names, address, phone, email, logo_url, cover_image_url, brand_color, kiosk_welcome_heading, kiosk_welcome_subtext, kiosk_access_code, timezone, sms_welcome_enabled, sms_birthday_enabled, sms_missed_enabled, sms_sender_id } = body;

    // The timezone drives every "today" and "this month" in the app, plus the
    // day birthday emails fire on. A typo here would silently shift all of them,
    // so it is checked against the platform's own zone database rather than
    // trusted — an unknown zone makes Intl throw, which is the whole test.
    if (timezone !== undefined && timezone !== null && String(timezone).trim() !== '') {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: String(timezone) });
      } catch {
        return NextResponse.json({ error: 'That is not a recognised timezone.' }, { status: 400 });
      }
    }

    // The church chooses its own unlock code — it has to be something an usher
    // can be told once and remember. Letters and digits only, because it gets
    // typed on a tablet's on-screen keyboard.
    if (kiosk_access_code !== undefined) {
      const code = String(kiosk_access_code).trim();

      if (code.length > 0) {
        if (code.length < 4 || code.length > 12) {
          return NextResponse.json({ error: 'Kiosk code must be 4 to 12 characters.' }, { status: 400 });
        }
        if (!/^[a-zA-Z0-9]+$/.test(code)) {
          return NextResponse.json({ error: 'Kiosk code can only contain letters and numbers.' }, { status: 400 });
        }
      }

      const { error: codeError } = await supabase
        .from('app_settings')
        .upsert({
          org_id: auth.session.orgId,
          // Empty clears the lock entirely — a deliberate choice for churches
          // that don't want one. The kiosk unlocks freely when it is null.
          kiosk_access_code: code.length > 0 ? code : null,
          updated_at: new Date().toISOString(),
        });

      if (codeError) {
        return NextResponse.json({ error: codeError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, kiosk_access_code: code || null });
    }

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
    const orgFields: Record<string, unknown> = { tagline, host_names, address, phone, email, logo_url, cover_image_url, brand_color, kiosk_welcome_heading, kiosk_welcome_subtext, timezone, sms_welcome_enabled, sms_birthday_enabled, sms_missed_enabled, sms_sender_id };
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
