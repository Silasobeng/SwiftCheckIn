import { NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';
import { sendBrevoEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Temporary — sends one real email to a Gmail address that's deliberately
// made up (real domain, so it passes the kiosk's own MX check; nonexistent
// mailbox, so Gmail will genuinely hard-bounce it) to verify the Resend
// bounce webhook actually flags people.email_invalid_at. Creates a throwaway
// test person to check afterward. Remove this route once confirmed working.
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  const supabase = getServerSupabase();
  const testEmail = `wemotiply-bounce-test-${Date.now()}@gmail.com`;

  const { data: person, error: insertError } = await supabase
    .from('people')
    .insert({
      org_id: auth.session.orgId,
      full_name: 'Bounce Test (delete me)',
      phone: `0000${Date.now()}`.slice(-10),
      email: testEmail,
      role: 'visitor',
    })
    .select()
    .single();

  if (insertError || !person) {
    return NextResponse.json({ error: insertError?.message || 'Could not create test person' }, { status: 500 });
  }

  const result = await sendBrevoEmail(
    [{ email: testEmail, name: 'Bounce Test' }],
    'WeMotiply bounce test',
    '<p>This should never be delivered — testing bounce detection.</p>',
    'WeMotiply'
  );

  return NextResponse.json({
    testEmail,
    personId: person.id,
    sendResult: result,
    note: 'Gmail usually reports the bounce within a few minutes. Check back by re-fetching this person or ask Claude to check.',
  });
}
