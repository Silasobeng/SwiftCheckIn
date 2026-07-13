import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, isSubscriptionValid } from '@/lib/supabase';
import { sendBrevoEmail, processTemplate } from '@/lib/email';
import { buildBrandedEmail } from '@/lib/emailTemplate';

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
      .select('id, name, brand_color, logo_url, address, phone, email, subscription_status, subscription_end_date');

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
        // Parse the processed body into greeting/body/sign-off for the premium template
        let text = body.trim();
        let greeting = '';
        const gm = text.match(/^Dear\s+([^,\n]+),?\s*/i);
        if (gm) { greeting = `Happy Birthday, ${gm[1].trim()}! 🎂`; text = text.slice(gm[0].length).trim(); }
        let signOff = '';
        const si = text.search(/\n\s*With love,/i);
        if (si !== -1) { signOff = text.slice(si).trim(); text = text.slice(0, si).trim(); }
        const html = buildBrandedEmail({ orgName: org.name, brandColor: org.brand_color, logoUrl: org.logo_url, greeting: greeting || 'Happy Birthday!', body: text, signOff: signOff || `With love,\nThe ${org.name} Family`, address: org.address, phone: org.phone, email: org.email });
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
