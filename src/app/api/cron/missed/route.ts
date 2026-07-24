import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, isSubscriptionValid } from '@/lib/supabase';
import { sendBrevoEmail, processTemplate } from '@/lib/email';
import { buildBrandedEmail } from '@/lib/emailTemplate';
import { getRecentServiceDates } from '@/lib/attendance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getServerSupabase();

    // Get all active organizations
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, brand_color, logo_url, address, phone, email, subscription_status, subscription_end_date');

    if (!orgs) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    let totalSent = 0;

    for (const org of orgs) {
      // Check subscription
      if (!isSubscriptionValid(org.subscription_status, org.subscription_end_date)) {
        continue;
      }

      // The 2 most recent service DAYS, not service rows. A church running a
      // 9am and an 11am on the same Sunday was previously treated as having
      // held two gatherings, so this fired after one missed Sunday.
      const recentDates = await getRecentServiceDates(supabase, org.id, 2);

      if (recentDates.length < 2) continue;

      const { data: recentServices } = await supabase
        .from('services')
        .select('id')
        .eq('org_id', org.id)
        .in('service_date', recentDates);

      const recentServiceIds = (recentServices ?? []).map((s) => s.id);
      if (recentServiceIds.length === 0) continue;

      // Get people who checked in to those services
      const { data: recentCheckins } = await supabase
        .from('checkins')
        .select('person_id')
        .eq('org_id', org.id)
        .in('service_id', recentServiceIds);

      const checkedInPersonIds = new Set(recentCheckins?.map((c) => c.person_id) || []);

      // Get missed template
      const { data: template } = await supabase
        .from('email_templates')
        .select('*')
        .eq('org_id', org.id)
        .eq('template_type', 'missed')
        .single();

      if (!template) continue;

      // Find members/leaders who missed the last 2 services
      const { data: allMembers } = await supabase
        .from('people')
        .select('*')
        .eq('org_id', org.id)
        .eq('archived', false)
        .in('role', ['member', 'leader'])
        .not('email', 'is', null);

      if (!allMembers) continue;

      const absentees = allMembers.filter((p) => !checkedInPersonIds.has(p.id));

      for (const person of absentees) {
        if (!person.email) continue;

        // Check if we already sent a missed email recently (within 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: recentEmail } = await supabase
          .from('email_logs')
          .select('id')
          .eq('org_id', org.id)
          .eq('person_id', person.id)
          .eq('email_type', 'missed')
          .gte('created_at', sevenDaysAgo.toISOString())
          .maybeSingle();

        if (recentEmail) continue; // Already sent recently

        const subject = processTemplate(template.subject, person, org as any);
        const body = processTemplate(template.body, person, org as any);
        let text = body.trim();
        let greeting = '';
        const gm = text.match(/^Dear\s+([^,\n]+),?\s*/i);
        if (gm) { greeting = `Hi ${gm[1].trim()},`; text = text.slice(gm[0].length).trim(); }
        let signOff = '';
        const si = text.search(/\n\s*With love,/i);
        if (si !== -1) { signOff = text.slice(si).trim(); text = text.slice(0, si).trim(); }
        const html = buildBrandedEmail({ orgName: org.name, brandColor: org.brand_color, logoUrl: org.logo_url, greeting: greeting || 'Hi there,', body: text, signOff: signOff || `With love,\nThe ${org.name} Family`, address: org.address, phone: org.phone, email: org.email });

        const result = await sendBrevoEmail(
          [{ email: person.email, name: person.full_name }],
          subject,
          html,
          org.name
        );

        // Log the email
        await supabase.from('email_logs').insert({
          org_id: org.id,
          person_id: person.id,
          email_type: 'missed',
          subject,
          recipient_email: person.email,
          status: result.success ? 'sent' : 'failed',
        });

        if (result.success) totalSent++;
      }
    }

    return NextResponse.json({ success: true, sent: totalSent });
  } catch (error) {
    console.error('Missed cron error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
