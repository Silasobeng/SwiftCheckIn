import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { getServerSupabase } from '@/lib/supabase';
import { createSession, setSessionCookie } from '@/lib/auth';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit';
import { slugify } from '@/lib/utils';

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = getClientIP(request);
  const rateCheck = checkRateLimit(`signup:${ip}`, RATE_LIMITS.signup);
  
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many signup attempts. Please try again later.' },
      { 
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  try {
    const supabase = getServerSupabase();
    const body = await request.json();

    const { churchName, adminName, email, phone, password, timezone } = body;

    // Sent by the browser at signup. Anything unrecognised is dropped rather
    // than stored — a bad zone here would silently skew every date in the app.
    let safeTimezone: string | null = null;
    if (typeof timezone === 'string' && timezone.trim()) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        safeTimezone = timezone;
      } catch { safeTimezone = null; }
    }

    // Validation
    if (!churchName || !adminName || !email || !password) {
      return NextResponse.json(
        { error: 'All required fields must be provided' },
        { status: 400 }
      );
    }

    // Password strength requirements
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('admin_email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Generate unique slug
    let slug = slugify(churchName);
    const { data: slugExists } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (slugExists) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Hash password with strong cost factor
    const passwordHash = await hash(password, 12);

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: churchName.trim(),
        slug,
        admin_name: adminName.trim(),
        admin_email: email.toLowerCase().trim(),
        admin_password_hash: passwordHash,
        phone: phone?.trim() || null,
        timezone: safeTimezone,
        subscription_status: 'trial',
        subscription_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      })
      .select()
      .single();

    if (orgError || !org) {
      console.error('Org creation error:', orgError);
      return NextResponse.json(
        { error: 'Failed to create organization' },
        { status: 500 }
      );
    }

    // Create app settings
    await supabase.from('app_settings').insert({
      org_id: org.id,
      kiosk_open: false,
      active_service_id: null,
    });

    // Default email templates.
    //
    // Subjects deliberately carry no emoji. Gmail reads emoji in a subject as a
    // marketing signal and files the message under Promotions, which is exactly
    // where these must not go — and a decorated missed-visit subject in particular contradicts
    // the message underneath it, which is written to read as a personal note.
    // A church can still add emoji from the Emails tab if it wants them.
    const { error: templateError } = await supabase.from('email_templates').insert([
      {
        org_id: org.id,
        template_type: 'welcome',
        subject: 'Welcome to {ORG_NAME}',
        body: `Dear {NAME},

We are so glad you joined us today!

{SERVICE_INFO}

We look forward to seeing you again soon.

With love,
The {ORG_NAME} Family`,
      },
      {
        org_id: org.id,
        template_type: 'birthday',
        subject: 'Happy Birthday from {ORG_NAME}',
        body: `Dear {NAME},

Wishing you a blessed and joyful birthday!

May this new year of your life be filled with God's grace and favor.

With love,
The {ORG_NAME} Family`,
      },
      {
        org_id: org.id,
        template_type: 'missed',
        subject: 'We have been thinking of you',
        body: `Dear {NAME},

We noticed you have missed the last couple of gatherings. We hope everything is well with you.

We would love to see you again soon!

With love,
The {ORG_NAME} Family`,
      },
    ]);

    // Not fatal — the account is already usable and the Emails tab can recreate
    // these. But it must not vanish: without templates the welcome, birthday and
    // we-miss-you sends all return "Template not found" and quietly do nothing,
    // and the church has no way to tell that from "nobody had a birthday".
    if (templateError) {
      console.error(`Default email templates not created for org ${org.id}:`, templateError);
    }

    // Starter Department category. Departments (Choir, Ushering, Protocol,
    // Media...) repeat across nearly every church in a way cell group names
    // never do, so this is worth having ready on day one rather than making
    // every new church type the same eight names in by hand. Not fatal, and
    // not required — a church can rename, delete, or ignore all of it from
    // Settings, same as anything it creates itself.
    const { data: departmentCategory, error: categoryError } = await supabase
      .from('group_categories')
      .insert({ org_id: org.id, name: 'Department' })
      .select('id')
      .single();

    if (categoryError || !departmentCategory) {
      console.error(`Department category not created for org ${org.id}:`, categoryError);
    } else {
      const defaultDepartments = ['Choir', 'Ushering', 'Protocol', 'Media', 'Prayer Team', "Children's Ministry", 'Welfare', 'Security'];
      const { error: groupsError } = await supabase
        .from('groups')
        .insert(defaultDepartments.map(name => ({ org_id: org.id, category_id: departmentCategory.id, name })));
      if (groupsError) {
        console.error(`Default departments not created for org ${org.id}:`, groupsError);
      }
    }

    // Create session
    const token = await createSession(org);
    await setSessionCookie(token);

    return NextResponse.json({
      success: true,
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
