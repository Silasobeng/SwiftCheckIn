import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';
import { sendBrevoEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;
  try {
    const { credits, budgetGhs, note } = await request.json();
    if (!Number.isInteger(credits) || credits < 1 || credits > 100000) return NextResponse.json({ error: 'Enter a valid number of SMS credits.' }, { status: 400 });
    if (budgetGhs !== undefined && budgetGhs !== '' && (!Number.isFinite(Number(budgetGhs)) || Number(budgetGhs) < 0)) return NextResponse.json({ error: 'Enter a valid budget.' }, { status: 400 });
    const supabase = getServerSupabase();
    const { data, error } = await supabase.from('sms_bundle_requests').insert({ org_id: auth.session.orgId, requested_credits: credits, budget_ghs: budgetGhs === '' || budgetGhs === undefined ? null : Number(budgetGhs), note: typeof note === 'string' ? note.trim().slice(0, 500) || null : null }).select('id').single();
    if (error) throw new Error(error.message);
    const ownerEmail = process.env.OWNER_ALERT_EMAIL;
    if (ownerEmail) await sendBrevoEmail([{ email: ownerEmail }], `SMS bundle request: ${auth.session.orgName}`, `<p><strong>${auth.session.orgName}</strong> requested <strong>${credits.toLocaleString()} SMS credits</strong>.</p><p>Open the Developer Portal to set a price and send their payment link.</p>`).catch(console.error);
    return NextResponse.json({ success: true, id: data.id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not send request.' }, { status: 500 }); }
}
