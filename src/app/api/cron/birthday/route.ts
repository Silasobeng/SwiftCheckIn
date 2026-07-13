import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, isSubscriptionValid } from '@/lib/supabase';
import { sendBrevoEmail, textToHtml, processTemplate } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getServerSupabase();
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day   = String(today.getDate()).padStart(2, '0');

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, brand_color, subscription_status, subscription_end_date');

    if (!orgs) return NextResponse.json({ success: true, sent: 0 });

    let totalSent = 0;

    for (const org of orgs) {
      if (!isSubscriptionValid(org.subscription_status, org.subscription_end_date)) continue;

      const { data: template } = await supabase
        .from('email_templates').select('*')
        .eq('org_id', org.id).eq('template_type', 'birthday').single();
      if (!template) continue;

      // ── Fixed: filter birthdays in the database, not in JS ──
      const { data: people } = await supabase
        .from('people').select('*')
        .eq('org_id', org.id).eq('archived', false)
        .not('email', 'is', null)
        .not('date_of_birth', 'is', null)
        // Match month and day using substring — works on YYYY-MM-DD format
        .like('date_of_birth', `%-${month}-${day}`);

      if (!people || people.length === 0) continue;

      for (const person of people) {
        if (!person.email) continue;
        const subject = processTemplate(template.subject, person, org as any);
        const body    = processTemplate(template.body,    person, org as any);
        const html    = textToHtml(body, org.name, org.brand_color);
        const result  = await sendBrevoEmail(
          [{ email: person.email, name: person.full_name }],
          subject, html, org.name
        );
        await supabase.from('email_logs').insert({
          org_id: org.id, person_id: person.id,
          email_type: 'birthday', subject,
          recipient_email: person.email,
          status: result.success ? 'sent' : 'failed',
        });
        if (result.success) totalSent++;
      }
    }

    return NextResponse.json({ success: true, sent: totalSent });
  } catch (error) {
    console.error('Birthday cron error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
