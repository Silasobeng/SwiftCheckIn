import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireOwner();
  if ('error' in auth) return auth.error;

  try {
    const { orgId, confirmation } = await request.json();
    if (!orgId || confirmation !== 'I AM SURE') {
      return NextResponse.json({ error: 'Confirmation failed' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    await supabase.from('checkins').delete().eq('org_id', orgId);
    await supabase.from('email_logs').delete().eq('org_id', orgId);
    await supabase.from('services').delete().eq('org_id', orgId);
    await supabase.from('people').delete().eq('org_id', orgId);
    const { error } = await supabase
      .from('app_settings')
      .update({ kiosk_open: false, active_service_id: null, updated_at: new Date().toISOString() })
      .eq('org_id', orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Owner reset error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
