import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { getServerSupabase } from '@/lib/supabase';
import { createSession, setSessionCookie } from '@/lib/auth';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = getClientIP(request);
  const rateCheck = checkRateLimit(`login:${ip}`, RATE_LIMITS.login);
  
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
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
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find organization by admin email
    const { data: org, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('admin_email', email.toLowerCase().trim())
      .single();

    if (error || !org) {
      // Use same error message for security (don't reveal if email exists)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // HARDENED: Only bcrypt passwords allowed - NO plain text fallback
    if (!org.admin_password_hash.startsWith('$2')) {
      console.error(`Organization ${org.id} has non-bcrypt password - migration required`);
      return NextResponse.json(
        { error: 'Account requires password reset. Please contact support.' },
        { status: 401 }
      );
    }

    const passwordValid = await compare(password, org.admin_password_hash);

    if (!passwordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
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
        subscriptionStatus: org.subscription_status,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
