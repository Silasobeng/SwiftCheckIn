import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  // Rate limiting - use stricter limits for password reset
  const ip = getClientIP(request);
  const rateCheck = checkRateLimit(`forgot-password:${ip}`, { limit: 3, windowSec: 60 * 60 }); // 3 per hour
  
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many reset requests. Please try again later.' },
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
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find organization by admin email
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, admin_email')
      .eq('admin_email', normalizedEmail)
      .single();

    // Always return success (don't reveal if email exists)
    // But only send email if org exists
    if (org) {
      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      // Store reset token in database
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          password_reset_token: resetTokenHash,
          password_reset_expires: expiresAt,
        })
        .eq('id', org.id);

      if (updateError) {
        console.error('Failed to store reset token:', updateError);
        return NextResponse.json(
          { error: 'Failed to process request' },
          { status: 500 }
        );
      }

      // Send reset email via Brevo
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://swift-check-in-seven.vercel.app'}/reset-password?token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;

      try {
        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': process.env.BREVO_API_KEY || '',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: {
              name: 'WeMotiply',
              email: process.env.BREVO_SENDER_EMAIL || 'noreply@wemotiply.com',
            },
            to: [{ email: normalizedEmail, name: org.name }],
            subject: 'Reset Your Password - WeMotiply',
            htmlContent: `
              <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #102a43; font-size: 28px; margin: 0;">WeMotiply</h1>
                  <p style="color: #627d98; font-size: 14px; margin-top: 5px;">Together, we multiply.</p>
                </div>
                
                <div style="background: #ffffff; border-radius: 12px; padding: 30px; border: 1px solid #e8eff5;">
                  <h2 style="color: #102a43; font-size: 20px; margin-top: 0;">Reset Your Password</h2>
                  <p style="color: #486581; font-size: 16px; line-height: 1.6;">
                    Hi ${org.name},<br><br>
                    We received a request to reset your password. Click the button below to create a new password:
                  </p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(to right, #f59e0b, #fbbf24); color: #102a43; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 16px;">
                      Reset Password
                    </a>
                  </div>
                  
                  <p style="color: #829ab1; font-size: 14px; line-height: 1.6;">
                    This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
                  </p>
                  
                  <hr style="border: none; border-top: 1px solid #e8eff5; margin: 25px 0;">
                  
                  <p style="color: #829ab1; font-size: 12px; margin: 0;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${resetUrl}" style="color: #fbbf24; word-break: break-all;">${resetUrl}</a>
                  </p>
                </div>
                
                <p style="text-align: center; color: #829ab1; font-size: 12px; margin-top: 30px;">
                  © ${new Date().getFullYear()} WeMotiply
                </p>
              </div>
            `,
          }),
        });

        if (!brevoResponse.ok) {
          console.error('Brevo email failed:', await brevoResponse.text());
        }
      } catch (emailError) {
        console.error('Failed to send reset email:', emailError);
        // Don't fail the request - user shouldn't know if email failed
      }
    }

    // Always return success for security
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
