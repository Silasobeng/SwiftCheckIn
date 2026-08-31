import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, isSubscriptionValid } from '@/lib/supabase';
import { sendWelcomeEmail } from '@/lib/email';
import { sendSMS, welcomeMessage } from '@/lib/sms';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { tzFormatter, dayKeyOf } from '@/lib/monthWindow';
import { formatPersonName, validatePersonIdentity } from '@/lib/personIdentity';

// A service is only "today" once, in the church's own timezone — a kiosk left
// open past that (nobody closed it after Sunday) must not silently accept a
// Wednesday walk-up into Sunday's attendance. Checked at both the point where
// the kiosk loads its screen and the point where a check-in is submitted,
// since either can be the first request after the day rolls over.
function isServiceToday(serviceDate: string, timezone: string): boolean {
  return dayKeyOf(tzFormatter(timezone), new Date()) === serviceDate;
}

export const dynamic = 'force-dynamic';

// GET - Get kiosk status and data for a specific org (by slug)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json({ error: 'Organization slug is required' }, { status: 400 });
    }

    const supabase = getServerSupabase();

    // Get organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
.select('id, name, slug, tagline, logo_url, cover_image_url, brand_color, kiosk_welcome_heading, kiosk_welcome_subtext, subscription_status, subscription_end_date, timezone')
      .eq('slug', slug)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Check subscription
    if (!isSubscriptionValid(org.subscription_status, org.subscription_end_date)) {
      return NextResponse.json({ error: 'Subscription expired', code: 'SUBSCRIPTION_EXPIRED' }, { status: 403 });
    }

    // Get settings
    const { data: settings } = await supabase
      .from('app_settings')
      .select('kiosk_open, active_service_id')
      .eq('org_id', org.id)
      .maybeSingle();

    if (!settings?.kiosk_open) {
      return NextResponse.json({ 
        error: 'Kiosk is closed', 
        code: 'KIOSK_CLOSED',
        org: { name: org.name, tagline: org.tagline, logo_url: org.logo_url, cover_image_url: org.cover_image_url, brand_color: org.brand_color, kiosk_welcome_heading: org.kiosk_welcome_heading, kiosk_welcome_subtext: org.kiosk_welcome_subtext }
      }, { status: 403 });
    }

    // Get active service
    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', settings.active_service_id)
      .single();

    if (!service) {
      return NextResponse.json({ error: 'No active service', code: 'NO_SERVICE' }, { status: 403 });
    }

    // The day has moved on and nobody closed the kiosk. Close it now, so the
    // very next load — from this tablet or any other — reads as closed
    // instead of re-running this same check every time.
    if (!isServiceToday(service.service_date, org.timezone)) {
      await supabase.from('app_settings').update({ kiosk_open: false }).eq('org_id', org.id);
      return NextResponse.json({
        error: 'This service has ended. Check-in is only open on the day of the service.',
        code: 'SERVICE_ENDED',
        org: { name: org.name, tagline: org.tagline, logo_url: org.logo_url, cover_image_url: org.cover_image_url, brand_color: org.brand_color, kiosk_welcome_heading: org.kiosk_welcome_heading, kiosk_welcome_subtext: org.kiosk_welcome_subtext }
      }, { status: 403 });
    }

    // Get people (non-archived)
    const { data: people } = await supabase
      .from('people')
      .select('id, full_name, phone')
      .eq('org_id', org.id)
      .eq('archived', false)
      .order('full_name');

    return NextResponse.json({
      org: {
        id: org.id,
        name: org.name,
        tagline: org.tagline,
        logo_url: org.logo_url,
        cover_image_url: org.cover_image_url,
        brand_color: org.brand_color,
        kiosk_welcome_heading: org.kiosk_welcome_heading,
        kiosk_welcome_subtext: org.kiosk_welcome_subtext,
      },
      service: {
        id: service.id,
        title: service.title,
        date: service.service_date,
        time: service.service_time,
        theme: service.theme,
        scripture: service.scripture,
      },
      people: people || [],
    });
  } catch (error) {
    console.error('Kiosk GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Perform a check-in (rate limited per org)
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const body = await request.json();

    const { orgSlug, personId, newPerson, serviceId } = body;

    if (!orgSlug || !serviceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Rate limiting per org
    const rateCheck = checkRateLimit(`checkin:${orgSlug}`, RATE_LIMITS.checkin);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many check-ins. Please wait a moment.' },
        { status: 429 }
      );
    }

    // Get org
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, subscription_status, subscription_end_date, timezone, sms_welcome_enabled, sms_credits')
      .eq('slug', orgSlug)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Check subscription
    if (!isSubscriptionValid(org.subscription_status, org.subscription_end_date)) {
      return NextResponse.json({ error: 'Subscription expired' }, { status: 403 });
    }

    // Verify kiosk is open
    const { data: settings } = await supabase
      .from('app_settings')
      .select('kiosk_open, active_service_id')
      .eq('org_id', org.id)
      .maybeSingle();

    if (!settings?.kiosk_open || settings.active_service_id !== serviceId) {
      return NextResponse.json({ error: 'Kiosk is not active for this service' }, { status: 403 });
    }

    // Get service and ensure it belongs to this org
    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .eq('org_id', org.id)
      .single();

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // Same staleness check as the kiosk GET — repeated here because this is
    // the request that actually writes attendance, and the GET's check only
    // guards what got shown on load. A tablet that stayed on this screen
    // since Sunday must still be stopped from writing a Wednesday check-in
    // into Sunday's service.
    if (!isServiceToday(service.service_date, org.timezone)) {
      await supabase.from('app_settings').update({ kiosk_open: false }).eq('org_id', org.id);
      return NextResponse.json({ error: 'This service has ended. Check-in is only open on the day of the service.' }, { status: 403 });
    }

    let person;
    let isFirstTime = false;

    if (newPerson) {
      // New person registration
      const { full_name, phone, gender, email } = newPerson;

      const identityError = validatePersonIdentity(full_name, phone);
      if (identityError) return NextResponse.json({ error: identityError }, { status: 400 });

      // Check if phone already exists
      const { data: existing } = await supabase
        .from('people')
        .select('*')
        .eq('org_id', org.id)
        .eq('phone', phone.trim())
        .maybeSingle();

      if (existing) {
        person = existing;
        isFirstTime = false;
      } else {
        const { data: newPersonData, error: personError } = await supabase
          .from('people')
          .insert({
            org_id: org.id,
            full_name: formatPersonName(full_name),
            phone: phone.trim(),
            gender: gender || null,
            email: email?.trim() || null,
            role: 'visitor',
            first_attendance_date: service?.service_date,
          })
          .select()
          .single();

        if (personError) {
          return NextResponse.json({ error: 'Failed to create person' }, { status: 500 });
        }

        person = newPersonData;
        isFirstTime = true;
      }
    } else if (personId) {
      const { data: existingPerson } = await supabase
        .from('people')
        .select('*')
        .eq('id', personId)
        .eq('org_id', org.id)
        .eq('archived', false)
        .single();

      if (!existingPerson) {
        return NextResponse.json({ error: 'Person not found' }, { status: 404 });
      }

      person = existingPerson;
      isFirstTime = false;
      
      // Check if already checked in for this service
      const { data: existingCheckin } = await supabase
        .from('checkins')
        .select('id, checked_in_at')
        .eq('org_id', org.id)
        .eq('person_id', personId)
        .eq('service_id', serviceId)
        .maybeSingle();
        
      if (existingCheckin) {
        // Already checked in - return special response
        return NextResponse.json({
          success: true,
          alreadyCheckedIn: true,
          person: {
            id: person.id,
            full_name: person.full_name,
          },
          isFirstTime: false,
        });
      }
    } else {
      return NextResponse.json({ error: 'Either personId or newPerson is required' }, { status: 400 });
    }

    // Create or update check-in
    const { error: checkinError } = await supabase
      .from('checkins')
      .upsert(
        {
          org_id: org.id,
          person_id: person.id,
          service_id: serviceId,
          checked_in_at: new Date().toISOString(),
          is_first_time: isFirstTime,
          synced: true,
        },
        { onConflict: 'org_id,person_id,service_id' }
      );

    if (checkinError) {
      console.error('Check-in error:', checkinError);
      return NextResponse.json({ error: 'Failed to check in' }, { status: 500 });
    }

    // Send welcome email for first-timers with a working email — an address
    // the Resend webhook has already marked as bounced/complained is treated
    // the same as having no email at all, so it falls through to SMS below
    // instead of silently trying the same dead address again.
    if (isFirstTime && person.email && !person.email_invalid_at) {
      sendWelcomeEmail(person, org.id, service).catch(console.error);
    }

    // Send welcome SMS for first-timers without a working email (phone is always present)
    if (isFirstTime && (!person.email || person.email_invalid_at) && org.sms_welcome_enabled && org.sms_credits > 0 && !person.sms_opted_out) {
      const firstName = person.full_name.split(' ')[0];
      sendSMS(person.phone, welcomeMessage(firstName, org.name), org.id, 'welcome', person.id).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      person: {
        id: person.id,
        full_name: person.full_name,
      },
      isFirstTime,
    });
  } catch (error) {
    console.error('Kiosk POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
