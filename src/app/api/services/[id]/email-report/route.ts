import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { sendBrevoEmail } from '@/lib/email';
import { buildCsv } from '@/lib/csv';
import { getDayAttendance } from '@/lib/attendance';

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
      .select('name, admin_email, email')
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
    const attendanceRate = expectedCount > 0
      ? Math.round(((expectedCount - absent.length) / expectedCount) * 100)
      : null;

    // Two labelled sections in one file so a pastor can open it in Excel and
    // work straight down the absent list.
    const rows: unknown[][] = [
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
    const serviceDateLabel = new Date(service.service_date).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    const filename = `attendance-${service.service_date}.csv`;

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
  <p style="font-size:15px;line-height:1.6;margin:0 0 18px;">Here is the attendance summary for <strong>${service.title || 'your service'}</strong> on ${serviceDateLabel}${serviceIds.length > 1 ? ` (${serviceIds.length} services combined)` : ''}.</p>

  <table style="border-collapse:collapse;margin:0 0 4px;">
    ${line('Present', count)}
    ${line('Absent (members &amp; leaders)', absent.length)}
    ${line('First-time visitors', firstTimers)}
    ${attendanceRate !== null ? line('Turnout', attendanceRate + '%') : ''}
  </table>

  ${followUpText}

  <p style="font-size:15px;line-height:1.6;margin:22px 0 0;">The attached spreadsheet lists everyone who came and everyone who was absent. Absentees include members and leaders only, so the list stays useful.</p>

  <p style="font-size:15px;line-height:1.6;margin:22px 0 0;">— ${org?.name || 'Your church'} check-in</p>
</div>
</body></html>`;

    // Reply-to the church's own address, so a reply reaches a human — another
    // Primary-inbox signal, and genuinely useful.
    const replyEmail = org?.email || org?.admin_email || undefined;

    const result = await sendBrevoEmail(
      [{ email: recipient }],
      `Attendance Report — ${service.title || 'Service'} (${serviceDateLabel})`,
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
