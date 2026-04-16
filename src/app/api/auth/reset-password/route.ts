import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import { getServerSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = getClientIP(request);
  const rateCheck = checkRateLimit(`reset-password:${ip}`, { limit: 5, windowSec: 60 * 60 }); // 5 per hour
  
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
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
    const { token, email, password } = await request.json();

    if (!token || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find organization with matching token
    const { data: org, error: findError } = await supabase
      .from('organizations')
      .select('id, password_reset_token, password_reset_expires')
      .eq('admin_email', normalizedEmail)
      .single();

    if (findError || !org) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link' },
        { status: 400 }
      );
    }

    // Verify token matches
    if (org.password_reset_token !== tokenHash) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link' },
        { status: 400 }
      );
    }

    // Check if token has expired
    if (new Date(org.password_reset_expires) < new Date()) {
      return NextResponse.json(
        { error: 'Reset link has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Hash the new password
    const passwordHash = await hash(password, 12);

    // Update password and clear reset token
    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        admin_password_hash: passwordHash,
        password_reset_token: null,
        password_reset_expires: null,
      })
      .eq('id', org.id);

    if (updateError) {
      console.error('Failed to update password:', updateError);
      return NextResponse.json(
        { error: 'Failed to reset password' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
