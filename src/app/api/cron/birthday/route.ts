import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, isSubscriptionValid } from '@/lib/supabase';
import { sendBrevoEmail, processTemplate, orgReplyTo } from '@/lib/email';
import { buildBrandedEmail } from '@/lib/emailTemplate';
import { sendSMS, birthdayMessage } from '@/lib/sms';
import { tzFormatter, dayKeyOf } from '@/lib/monthWindow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getServerSupabase();
    // "Today" is deliberately NOT computed here. This cron runs on Vercel, where
    // the server clock is UTC, so a single shared date sends a church in UTC+3 its
    // birthday emails on the wrong calendar day for several hours either side of
    // midnight. Each org's date is resolved below, in that church's own timezone.
    const now = new Date();

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, brand_color, logo_url, address, phone, email, admin_email, timezone, subscription_status, subscription_end_date, sms_birthday_enabled, sms_credits');

    if (!orgs) return NextResponse.json({ success: true, sent: 0 });

    let totalSent = 0;

    for (const org of orgs) {
      if (!isSubscriptionValid(org.subscription_status, org.subscription_end_date)) continue;

      const { data: template } = await supabase
        .from('email_templates').select('*')
        .eq('org_id', org.id).eq('template_type', 'birthday').single();
      if (!template) continue;

      // Today, as this church reckons it.
      const [, month, day] = dayKeyOf(tzFormatter(org.timezone || 'UTC'), now).split('-');

      // Fetch all people with a birthday today — both email and SMS paths
      const { data: people } = await supabase
        .from('people').select('*')
        .eq('org_id', org.id).eq('archived', false)
        .not('date_of_birth', 'is', null)
        .like('date_of_birth', `%-${month}-${day}`);

      if (!people || people.length === 0) continue;

      for (const person of people) {
        // SMS path: people without a working email (missing, or already
        // bounced/complained per the Resend webhook), if org has SMS enabled
        if (!person.email || person.email_invalid_at || person.email_needs_verification_at) {
          if (org.sms_birthday_enabled && org.sms_credits > 0 && !person.sms_opted_out) {
            const firstName = person.full_name.split(' ')[0];
            await sendSMS(person.phone, birthdayMessage(firstName, org.name), org.id, 'birthday', person.id);
          }
          continue;
        }
        const subject = processTemplate(template.subject, person, org as any);
        const body    = processTemplate(template.body,    person, org as any);
        // Parse the processed body into greeting/body/sign-off for the premium template
        let text = body.trim();
        let firstName = '';
        const gm = text.match(/^Dear\s+([^,\n]+),?\s*/i);
        if (gm) { firstName = gm[1].trim(); text = text.slice(gm[0].length).trim(); }
        let signOff = '';
        const si = text.search(/\n\s*With love,/i);
        if (si !== -1) { signOff = text.slice(si).trim(); text = text.slice(0, si).trim(); }
        const wish = firstName ? `Happy Birthday, ${firstName}!` : 'Happy Birthday!';
        // The celebratory band is what stops this being the welcome email with
        // different words — the one email of the set that should read as a moment.
        const html = buildBrandedEmail({
          orgName: org.name, brandColor: org.brand_color, logoUrl: org.logo_url,
          greeting: wish,
          hero: { emoji: '&#127874;', title: wish, sub: `From everyone at ${org.name}` },
          body: text,
          signOff: signOff || `With love,\nThe ${org.name} Family`,
          address: org.address, phone: org.phone, email: org.email,
        });
        const result  = await sendBrevoEmail(
          [{ email: person.email, name: person.full_name }],
          subject, html, org.name, undefined, orgReplyTo(org)
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
