import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// =============================================================
// HEALTH CHECK / KEEP-ALIVE
// =============================================================
// Two jobs, both important on the free Supabase tier:
//
// 1. It touches the database. A free project suspends after ~7 days without
//    activity, and a suspended project means the kiosk is dead on a Sunday
//    morning with no warning to anyone. An uptime pinger hitting this every
//    few hours keeps the clock permanently reset.
//
// 2. It tells you whether the database is actually reachable, rather than
//    whether Next.js is up — which is the thing that usually breaks.
//
// Deliberately NOT behind CRON_SECRET, unlike /api/cron/*. Those return 401
// before ever reaching Supabase, so a misconfigured secret leaves them useless
// as a keep-alive while still looking healthy in a dashboard. A keep-alive that
// only works when a secret is right is not a keep-alive.
//
// Safe to expose: it takes no input, returns no record, and reveals nothing
// about how many churches exist or who they are.
export async function GET() {
  try {
    const supabase = getServerSupabase();

    // The cheapest query that still proves a real round trip to Postgres:
    // one indexed column, one row, result discarded.
    const { error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Health check: database unreachable:', error.message);
      return NextResponse.json({ ok: false, db: 'down' }, { status: 503 });
    }

    return NextResponse.json(
      { ok: true, db: 'up', at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err) {
    console.error('Health check failed:', err);
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503 });
  }
}
