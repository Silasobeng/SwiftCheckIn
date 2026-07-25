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
      .select('name, admin_email')
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

    const stat = (label: string, value: string | number, tone = '#16243A') => `
      <td style="padding:0 8px;text-align:center;">
        <div style="font-family:Georgia,serif;font-size:26px;color:${tone};line-height:1;">${value}</div>
        <div style="font-size:12px;color:#7A6E60;margin-top:4px;">${label}</div>
      </td>`;

    const html = `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px;background:#F8F4EE;">
        <div style="background:#fff;border:1px solid #E4DFD5;border-radius:16px;padding:28px 24px;">
          <h2 style="color:#16243A;font-size:20px;margin:0 0 4px;font-family:Georgia,serif;font-weight:normal;">Attendance Report</h2>
          <p style="color:#7A6E60;font-size:14px;margin:0 0 24px;">
            ${service.title || 'Service'} — ${serviceDateLabel}${serviceIds.length > 1 ? ` · ${serviceIds.length} services` : ''}
          </p>

          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;"><tr>
            ${stat('Present', count)}
            ${stat('Absent', absent.length, absent.length > 0 ? '#C97B1A' : '#16243A')}
            ${stat('First-timers', firstTimers, '#2E7D4E')}
            ${attendanceRate !== null ? stat('Turnout', attendanceRate + '%') : ''}
          </tr></table>

          ${followUp.length > 0 ? `
            <div style="border-top:1px solid #E4DFD5;padding-top:20px;">
              <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#A89D8E;margin-bottom:12px;">Worth a call this week</div>
              ${followUp.map((p) => `
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F0EBE3;font-size:14px;">
                  <span style="color:#1C2A3A;">${p.full_name}${p.phone ? ` <span style="color:#A89D8E;font-size:12px;">${p.phone}</span>` : ''}</span>
                  <span style="color:#7A6E60;font-size:13px;">${p.weeksSinceLastVisit === null ? 'never visited' : p.weeksSinceLastVisit === 0 ? 'missed today' : `${p.weeksSinceLastVisit}w away`}</span>
                </div>`).join('')}
              ${absent.length > followUp.length ? `<div style="font-size:12px;color:#A89D8E;padding-top:12px;">+ ${absent.length - followUp.length} more in the attached file.</div>` : ''}
            </div>` : `
            <div style="border-top:1px solid #E4DFD5;padding-top:20px;font-size:14px;color:#2E7D4E;">
              Everyone on your members list was here. 🎉
            </div>`}

          <p style="color:#A89D8E;font-size:12px;margin-top:24px;">
            The attached CSV lists everyone who came and everyone who didn&rsquo;t. Absentees cover members and leaders only — visitors are left out so the list stays useful.
          </p>
        </div>
      </div>
    `;

    const result = await sendBrevoEmail(
      [{ email: recipient }],
      `Attendance Report — ${service.title || 'Service'} (${serviceDateLabel})`,
      html,
      org?.name || undefined,
      [{ content: csvBase64, name: filename }]
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
