import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Temporary — reads back whether the bounce test person got flagged yet.
// Remove alongside test-bounce once confirmed working.
export async function GET(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  const personId = request.nextUrl.searchParams.get('personId');
  if (!personId) return NextResponse.json({ error: 'Missing personId' }, { status: 400 });

  const supabase = getServerSupabase();
  const { data: person } = await supabase
    .from('people')
    .select('id, email, email_invalid_at')
    .eq('id', personId)
    .eq('org_id', auth.session.orgId)
    .single();

  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    email: person.email,
    flagged: !!person.email_invalid_at,
    email_invalid_at: person.email_invalid_at,
  });
}
