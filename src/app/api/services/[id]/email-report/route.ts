import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { sendBrevoEmail } from '@/lib/email';
import { buildCsv } from '@/lib/csv';
import { getDayAttendance } from '@/lib/attendance';
import { tzFormatter, dayKeyOf } from '@/lib/monthWindow';
import type { Giving, GivingType } from '@/types';

const GIVING_TYPE_ORDER: GivingType[] = ['tithe', 'offering', 'seed', 'pledge', 'other'];
const GIVING_TYPE_LABEL: Record<GivingType, string> = {
  tithe: 'Tithes',
  offering: 'Offerings',
  seed: 'Seed',
  pledge: 'Pledges',
  other: 'Other',
};

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const dynamic = 'force-dynamic';

// POST - Email a CSV attendance report for one service day to the org's admin.
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
    const members = present.filter((r) => r.person?.role === 'member').length;
    const leaders = present.filter((r) => r.person?.role === 'leader').length;
    const visitors = present.filter((r) => r.person?.role === 'visitor').length;
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

    const dayGiving = ((givingRows ?? []) as Giving[]).filter(
      (g) => dayKeyOf(tzFmt, g.created_at) === service.service_date
    );

    const currency = dayGiving[0]?.currency || 'GHS';
    const givingTotal = dayGiving.reduce((sum, g) => sum + Number(g.amount), 0);
    const givingByType = GIVING_TYPE_ORDER
      .map((type) => {
        const rows = dayGiving.filter((g) => g.giving_type === type);
        return { type, label: GIVING_TYPE_LABEL[type], rows, total: rows.reduce((s, g) => s + Number(g.amount), 0) };
      })
      .filter((g) => g.rows.length > 0);

    const serviceDateLabel = new Date(service.service_date).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    const generatedLabel = new Date().toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });

    // Header, summary and giving breakdown up top so the numbers a pastor
    // actually wants are visible the instant the file opens — the row-by-row
    // detail follows for anyone who wants to dig further.
    const rows: unknown[][] = [
      [`${org?.name || 'Church'} — Service Report`],
      [`${service.title || 'Service'} — ${serviceDateLabel}`],
      [`Generated ${generatedLabel}`],
      [],
      ['SUMMARY'],
      ['Total Present', count],
      ['Members', members],
      ['Leaders', leaders],
      ['Visitors', visitors],
      ['First-time Visitors', firstTimers],
      ['Absent (members & leaders)', absent.length],
      ...(attendanceRate !== null ? [['Turnout', `${attendanceRate}%`]] : []),
      [],
      ['GIVING SUMMARY'],
      ['Type', 'Givers', 'Amount'],
      ...givingByType.map((g) => [g.label, g.rows.length, money(g.total, currency)]),
      ['Total', dayGiving.length, money(givingTotal, currency)],
      [],
      ['GIVING DETAIL'],
      ['Giver Name', 'Type', 'Amount', 'Payment Method'],
      ...givingByType.flatMap((g) =>
        g.rows.map((r) => [
          r.giver_name,
          r.giving_type === 'other' ? (r.giving_type_other || 'Other') : g.label,
          money(Number(r.amount), r.currency),
          r.payment_method.replace('_', ' '),
        ])
      ),
      [],
      ['PRESENT'],
      ['Checked In At', 'Full Name', 'Phone', 'Email', 'Gender', 'Role', 'First Time'],
      ...present.map((row) => [
        row.checked_in_at,
        row.person?.full_name ?? '',
        row.person?.phone ?? '',
        row.person?.email ?? '',
        row.person?.gender ?? '',
        row.person?.role ?? '',
        row.is_first_time ? 'Yes' : 'No',
      ]),
      [],
      ['ABSENT (members and leaders only)'],
      ['Full Name', 'Phone', 'Email', 'Role', 'Last Visit', 'Weeks Away', 'Total Visits'],
      ...absent.map((p) => [
        p.full_name,
        p.phone ?? '',
        p.email ?? '',
        p.role,
        p.last_checkin_at ? p.last_checkin_at.split('T')[0] : 'Never',
        p.weeksSinceLastVisit ?? '—',
        p.total_checkins ?? 0,
      ]),
    ];

    const csv = buildCsv(rows);
    const csvBase64 = Buffer.from(csv, 'utf-8').toString('base64');
    const filename = `service-report-${service.service_date}.csv`;

    // Longest-away first — the names most worth a call this week.
    const followUp = absent.slice(0, 5);

    // Deliberately plain, text-forward layout. This is an internal staff
    // report, not a branded message to a member — the stat-tile "dashboard"
    // look reads as marketing to Gmail and lands in Promotions. A simple
    // notification styling stays in Primary and suits the audience.
    const line = (label: string, value: string | number) =>
      `<tr><td style="padding:3px 0;font-size:15px;color:#333;">${label}</td><td style="padding:3px 0 3px 24px;font-size:15px;color:#111;font-weight:600;text-align:right;">${value}</td></tr>`;

    const followUpText = followUp.length > 0
      ? `<p style="font-size:15px;color:#333;line-height:1.6;margin:20px 0 6px;">People worth following up with:</p>
         <ul style="margin:0 0 4px;padding-left:20px;font-size:15px;color:#333;line-height:1.7;">
           ${followUp.map((p) => `<li>${p.full_name}${p.phone ? ` — ${p.phone}` : ''} <span style="color:#777;">(${p.weeksSinceLastVisit === null ? 'never visited' : p.weeksSinceLastVisit === 0 ? 'missed today' : `${p.weeksSinceLastVisit} week${p.weeksSinceLastVisit === 1 ? '' : 's'} away`})</span></li>`).join('')}
         </ul>
         ${absent.length > followUp.length ? `<p style="font-size:14px;color:#777;margin:4px 0 0;">…and ${absent.length - followUp.length} more in the attached spreadsheet.</p>` : ''}`
      : `<p style="font-size:15px;color:#333;margin:20px 0 0;">Everyone on your members list attended.</p>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333;">
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi,</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 18px;">Here is the report for <strong>${service.title || 'your service'}</strong> on ${serviceDateLabel}${serviceIds.length > 1 ? ` (${serviceIds.length} services combined)` : ''}.</p>

  <table style="border-collapse:collapse;margin:0 0 4px;">
    ${line('Present', count)}
    ${line('Absent (members &amp; leaders)', absent.length)}
    ${line('First-time visitors', firstTimers)}
    ${attendanceRate !== null ? line('Turnout', attendanceRate + '%') : ''}
    ${line('Total giving', money(givingTotal, currency))}
  </table>

  ${followUpText}

  <p style="font-size:15px;line-height:1.6;margin:22px 0 0;">The attached spreadsheet has the full breakdown — attendance, giving by type with every giver's name, and who was absent.</p>

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
      [{ content: csvBase64, name: filename }],
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
