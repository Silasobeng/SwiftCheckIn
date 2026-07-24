import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST - Verify a kiosk access code so an usher/admin can unlock the tablet.
//
// The code is checked here rather than in the browser on purpose: the kiosk
// page is public, so anything sent to it can be read by any visitor holding
// the tablet. Only a yes/no ever crosses the wire.
export async function POST(request: NextRequest) {
  try {
    const { slug, code } = await request.json();

    if (!slug || typeof code !== 'string') {
      return NextResponse.json({ error: 'Missing access code' }, { status: 400 });
    }

    // Throttle per device+org so the 6-character code cannot be brute forced.
    const rate = checkRateLimit(`kiosk-exit:${slug}:${getClientIP(request)}`, { limit: 5, windowSec: 300 });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const supabase = getServerSupabase();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { data: settings } = await supabase
      .from('app_settings')
      .select('kiosk_access_code')
      .eq('org_id', org.id)
      .maybeSingle();

    const expected = settings?.kiosk_access_code;

    // No code configured yet — don't lock the church out of its own tablet.
    if (!expected) {
      return NextResponse.json({ success: true, unlocked: true, note: 'no_code_set' });
    }

    if (code.trim().toLowerCase() !== expected.trim().toLowerCase()) {
      return NextResponse.json({ error: 'That code is not right.' }, { status: 401 });
    }

    return NextResponse.json({ success: true, unlocked: true });
  } catch (error) {
    console.error('Kiosk exit error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
