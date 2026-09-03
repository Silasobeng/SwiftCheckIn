import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, isSubscriptionValid } from '@/lib/supabase';
import { sendBrevoEmail, processTemplate, orgReplyTo } from '@/lib/email';
import { buildBrandedEmail } from '@/lib/emailTemplate';
import { sendSMS, missedMessage } from '@/lib/sms';
import { getRecentServiceDates } from '@/lib/attendance';

export const dynamic = 'force-dynamic';

// A serverless invocation has a hard wall-clock limit, and this route used to
// send one email at a time with no ceiling: a church with 200 absentees meant
// 200 sequential Brevo round-trips in one request, so the function was killed
// part-way and the tail of the list silently never heard from anyone.
//
// Two changes make that safe. Sends go out in small concurrent batches, and the
// run stops at a fixed ceiling. Stopping early is not a loss: the 7-day
// suppression window below means whoever is skipped today is simply first in
// line tomorrow, so the backlog drains across runs instead of being dropped.
const MAX_EMAILS_PER_RUN = 120;
const BATCH_SIZE = 8;

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
      .select('id, name, brand_color, logo_url, address, phone, email, admin_email, subscription_status, subscription_end_date, sms_missed_enabled, sms_credits');

    if (!orgs) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    let totalSent = 0;
    let capped = false;

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

      // Fetch all members/leaders (email and non-email) — SMS fills the gap for people without email
      const { data: allMembers } = await supabase
        .from('people')
        .select('*')
        .eq('org_id', org.id)
        .eq('archived', false)
        .in('role', ['member', 'leader']);

      if (!allMembers) continue;

      const absentees = allMembers.filter((p) => !checkedInPersonIds.has(p.id));

      // Who has already had one of these in the last week. Fetched once for the
      // whole org — this used to be a separate round-trip per absentee, so the
      // slowest churches paid the largest query cost.
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentLogs } = await supabase
        .from('email_logs')
        .select('person_id')
        .eq('org_id', org.id)
        .eq('email_type', 'missed')
        .gte('created_at', sevenDaysAgo.toISOString());

      const alreadyEmailed = new Set((recentLogs ?? []).map((l) => l.person_id));

      // SMS suppression — same 7-day window, separate log table
      const { data: recentSmsLogs } = await supabase
        .from('sms_logs')
        .select('person_id')
        .eq('org_id', org.id)
        .eq('sms_type', 'missed')
        .gte('created_at', sevenDaysAgo.toISOString());
      const alreadyTexted = new Set((recentSmsLogs ?? []).map((l) => l.person_id));

      // People with a working email go through the email queue; everyone
      // else — no email, or one already marked bounced/complained by the
      // Resend webhook — goes through SMS instead of a dead address.
      const emailAbsentees = absentees.filter((p) => p.email && !p.email_invalid_at && !p.email_needs_verification_at && !alreadyEmailed.has(p.id));
      const smsAbsentees   = absentees.filter(
        (p) => (!p.email || p.email_invalid_at || p.email_needs_verification_at) && !p.sms_opted_out && !alreadyTexted.has(p.id) &&
               org.sms_missed_enabled && org.sms_credits > 0
      );

      // Fire SMS for no-email absentees immediately (low volume, no batching needed)
      for (const person of smsAbsentees) {
        if (org.sms_credits <= 0) break;
        const firstName = person.full_name.split(' ')[0];
        await sendSMS(person.phone, missedMessage(firstName, org.name), org.id, 'missed', person.id);
      }

      const queue = emailAbsentees;

      const replyTo = orgReplyTo(org);

      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        if (totalSent >= MAX_EMAILS_PER_RUN) { capped = true; break; }

        const batch = queue.slice(i, i + BATCH_SIZE);
        const outcomes = await Promise.all(batch.map(async (person) => {
          const subject = processTemplate(template.subject, person, org as any);
          const body = processTemplate(template.body, person, org as any);
          let text = body.trim();
          let greeting = '';
          const gm = text.match(/^Dear\s+([^,\n]+),?\s*/i);
          if (gm) { greeting = `Hi ${gm[1].trim()},`; text = text.slice(gm[0].length).trim(); }
          let signOff = '';
          const si = text.search(/\n\s*With love,/i);
          if (si !== -1) { signOff = text.slice(si).trim(); text = text.slice(0, si).trim(); }
          // Sent as a plain note, not a branded card. Someone who has quietly
          // stopped coming should receive something that reads like a person
          // noticed — a colour bar and a logo lockup say "mailing list", which
          // is the opposite of the message.
          const html = buildBrandedEmail({
            variant: 'note',
            orgName: org.name, brandColor: org.brand_color, logoUrl: org.logo_url,
            greeting: greeting || 'Hi there,',
            body: text,
            signOff: signOff || `With love,\nThe ${org.name} Family`,
            address: org.address, phone: org.phone, email: org.email,
          });

          const result = await sendBrevoEmail(
            [{ email: person.email as string, name: person.full_name }],
            subject,
            html,
            org.name,
            undefined,
            replyTo
          );

          return { person, subject, result };
        }));

        // One insert for the batch rather than one per person. Logging every
        // attempt — including failures — is what keeps the suppression window
        // honest: a person whose send failed must not be retried tomorrow and
        // then again the day after.
        await supabase.from('email_logs').insert(outcomes.map((o) => ({
          org_id: org.id,
          person_id: o.person.id,
          email_type: 'missed',
          subject: o.subject,
          recipient_email: o.person.email,
          status: o.result.success ? 'sent' : 'failed',
        })));

        totalSent += outcomes.filter((o) => o.result.success).length;
      }

      if (capped) break;
    }

    // `capped` tells you the ceiling was hit and a backlog remains for the next
    // run — without it a short run looks identical to "nobody needed emailing".
    return NextResponse.json({ success: true, sent: totalSent, capped });
  } catch (error) {
    console.error('Missed cron error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
