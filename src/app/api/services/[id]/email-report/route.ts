import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { sendBrevoEmail } from '@/lib/email';
import { getDayAttendance } from '@/lib/attendance';
import { tzFormatter, dayKeyOf } from '@/lib/monthWindow';
import { buildServiceReportWorkbook, type ReportGivingRow } from '@/lib/serviceReport';
import { escapeHtml } from '@/lib/emailTemplate';

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const dynamic = 'force-dynamic';

// POST - Email an .xlsx service report for one service day to the org's admin.
// Never downloads to the device — safe to trigger from a shared kiosk tablet too.
//
// The report covers the whole service DAY, not the single service row that was
// clicked, so churches running two Sunday services get one coherent picture
// instead of two contradictory ones.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { id: serviceId } = params;

    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .eq('org_id', auth.session.orgId)
      .single();

    if (serviceError || !service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, admin_email, email, timezone')
      .eq('id', auth.session.orgId)
      .single();

    // The sender may redirect the report to a pastor/secretary. Fall back to
    // the account's own admin email when none is supplied.
    let recipient = org?.admin_email || '';
    try {
      const body = await request.json();
      if (body?.recipient) recipient = String(body.recipient).trim();
    } catch {
      // No body — keep the admin-email default.
    }

    if (!recipient) {
      return NextResponse.json({ error: 'No email address to send the report to.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return NextResponse.json({ error: 'That recipient email is not valid.' }, { status: 400 });
    }

    const { present, absent, serviceIds, expectedCount } = await getDayAttendance(
      supabase,
      auth.session.orgId,
      service.service_date
    );

    const firstTimers = present.filter((r) => r.is_first_time).length;
    const count = present.length;
    const absentMembers = absent.filter((p) => p.role === 'member');
    const absentLeaders = absent.filter((p) => p.role === 'leader');
    const attendanceRate = expectedCount > 0
      ? Math.round(((expectedCount - absent.length) / expectedCount) * 100)
      : null;

    // Giving is reckoned by calendar day in the church's own timezone, not by
    // service_id — givers aren't always tied to a specific check-in session
    // (mobile money gifts midweek, for example), same day as the service is
    // the useful bucket. A one-man church needs the full picture, so this is
    // deliberately not anonymised: every giver's name is shown.
    const tzFmt = tzFormatter(org?.timezone || 'UTC');
    const { data: givingRows } = await supabase
      .from('giving')
      .select('giver_name, amount, currency, giving_type, giving_type_other, payment_method, created_at')
      .eq('org_id', auth.session.orgId)
      .order('created_at', { ascending: true });

    const dayGiving = ((givingRows ?? []) as ReportGivingRow[]).filter(
      (g) => dayKeyOf(tzFmt, g.created_at) === service.service_date
    );

    const currency = dayGiving[0]?.currency || 'GHS';
    const givingTotal = dayGiving.reduce((sum, g) => sum + Number(g.amount), 0);

    const serviceDateLabel = new Date(`${service.service_date}T12:00:00Z`).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric', timeZone:'UTC' });
    const generatedLabel = new Date().toLocaleString('en-US', {
      month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit',
      timeZone: org?.timezone || 'UTC',
    });

    const workbook = await buildServiceReportWorkbook({
      orgName: org?.name || 'Church',
      serviceTitle: service.title || 'Service',
      serviceDateLabel,
      generatedLabel,
      timeZone: org?.timezone || 'UTC',
      present,
      absent,
      expectedCount,
      giving: dayGiving,
      currency,
    });
    const attachmentBase64 = workbook.toString('base64');
    const filename = `service-report-${service.service_date}.xlsx`;

    // Members only, longest-away first — the names most worth a call this week.
    // A missing leader is called out separately below, because burying one
    // among a dozen absent members is exactly how it gets missed.
    const followUp = absentMembers.slice(0, 5);

    // Deliberately plain, text-forward layout. This is an internal staff
    // report, not a branded message to a member — the stat-tile "dashboard"
    // look reads as marketing to Gmail and lands in Promotions. A simple
    // notification styling stays in Primary and suits the audience.
    const line = (label: string, value: string | number) =>
      `<tr><td style="padding:3px 0;font-size:15px;color:#333;">${label}</td><td style="padding:3px 0 3px 24px;font-size:15px;color:#111;font-weight:600;text-align:right;">${value}</td></tr>`;

    // A leader who didn't turn up is a different kind of news from a member who
    // didn't — it goes first, and by name, however short the list.
    const leaderText = absentLeaders.length > 0
      ? `<p style="font-size:15px;color:#333;line-height:1.6;margin:20px 0 6px;">Leaders not present:</p>
         <ul style="margin:0;padding-left:20px;font-size:15px;color:#333;line-height:1.7;">
           ${absentLeaders.map((p) => `<li>${escapeHtml(p.full_name)}${p.phone ? ` — ${escapeHtml(p.phone)}` : ''}</li>`).join('')}
         </ul>`
      : `<p style="font-size:15px;color:#333;line-height:1.6;margin:20px 0 0;">All leaders were present.</p>`;

    const followUpText = followUp.length > 0
      ? `<p style="font-size:15px;color:#333;line-height:1.6;margin:20px 0 6px;">Members worth following up with:</p>
         <ul style="margin:0 0 4px;padding-left:20px;font-size:15px;color:#333;line-height:1.7;">
           ${followUp.map((p) => `<li>${escapeHtml(p.full_name)}${p.phone ? ` — ${escapeHtml(p.phone)}` : ''} <span style="color:#777;">(${p.weeksSinceLastVisit === null ? 'never visited' : p.weeksSinceLastVisit === 0 ? 'missed today' : `${p.weeksSinceLastVisit} week${p.weeksSinceLastVisit === 1 ? '' : 's'} away`})</span></li>`).join('')}
         </ul>
         ${absentMembers.length > followUp.length ? `<p style="font-size:14px;color:#777;margin:4px 0 0;">…and ${absentMembers.length - followUp.length} more on the Follow Up sheet.</p>` : ''}`
      : `<p style="font-size:15px;color:#333;margin:20px 0 0;">Every member attended.</p>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333;">
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi,</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 18px;">Here is the report for <strong>${service.title || 'your service'}</strong> on ${serviceDateLabel}${serviceIds.length > 1 ? ` (${serviceIds.length} services combined)` : ''}.</p>

  <table style="border-collapse:collapse;margin:0 0 4px;">
    ${line('Present', count)}
    ${line('First-time visitors', firstTimers)}
    ${line('Absent members', absentMembers.length)}
    ${line('Absent leaders', absentLeaders.length)}
    ${attendanceRate !== null ? line('Turnout', attendanceRate + '%') : ''}
    ${line('Total giving', money(givingTotal, currency))}
  </table>

  ${leaderText}

  ${followUpText}

  <p style="font-size:15px;line-height:1.6;margin:22px 0 0;">The attached workbook has four sheets: <strong>Summary</strong>, <strong>Attendance</strong>, <strong>Follow Up</strong> and <strong>Giving</strong>.</p>

  <p style="font-size:15px;line-height:1.6;margin:22px 0 0;">— ${org?.name || 'Your church'} check-in</p>
</div>
</body></html>`;

    // Reply-to the church's own address, so a reply reaches a human — another
    // Primary-inbox signal, and genuinely useful.
    const replyEmail = org?.email || org?.admin_email || undefined;

    const result = await sendBrevoEmail(
      [{ email: recipient }],
      `Service Report — ${service.title || 'Service'} (${serviceDateLabel})`,
      html,
      org?.name || undefined,
      [{ content: attachmentBase64, name: filename }],
      replyEmail ? { email: replyEmail, name: org?.name || undefined } : undefined
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send report email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count, absent: absent.length, firstTimers, recipient });
  } catch (error) {
    console.error('Email attendance report error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
