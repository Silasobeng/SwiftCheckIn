import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { sendBrevoEmail } from '@/lib/email';
import { buildCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

// POST - Email a CSV attendance report for one service to the org's admin email.
// Never downloads to the device — safe to trigger from a shared kiosk tablet too.
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

    if (!org?.admin_email) {
      return NextResponse.json({ error: 'No admin email on file for this account' }, { status: 400 });
    }

    const { data: checkins, error: checkinsError } = await supabase
      .from('checkins')
      .select('checked_in_at, is_first_time, person:people(full_name,phone,email,gender,role)')
      .eq('org_id', auth.session.orgId)
      .eq('service_id', serviceId)
      .order('checked_in_at', { ascending: true });

    if (checkinsError) {
      return NextResponse.json({ error: checkinsError.message }, { status: 500 });
    }

    const rows: unknown[][] = [
      ['Checked In At', 'Full Name', 'Phone', 'Email', 'Gender', 'Role', 'First Time'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(checkins ?? []).map((row: any) => [
        row.checked_in_at,
        row.person?.full_name ?? '',
        row.person?.phone ?? '',
        row.person?.email ?? '',
        row.person?.gender ?? '',
        row.person?.role ?? '',
        row.is_first_time ? 'Yes' : 'No',
      ]),
    ];

    const csv = buildCsv(rows);
    const csvBase64 = Buffer.from(csv, 'utf-8').toString('base64');
    const serviceDateLabel = new Date(service.service_date).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    const filename = `attendance-${service.service_date}.csv`;
    const count = checkins?.length ?? 0;

    // First-timers — real count from the is_first_time flag already set at check-in
    const firstTimerCount = (checkins ?? []).filter((c) => c.is_first_time).length;

    // Gender breakdown — real counts from each linked person's gender field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maleCount   = (checkins ?? []).filter((c: any) => c.person?.gender === 'male').length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const femaleCount = (checkins ?? []).filter((c: any) => c.person?.gender === 'female').length;

    // Trend — real count from the most recent previous service, by actual date
    const { data: prevService } = await supabase
      .from('services')
      .select('id')
      .eq('org_id', auth.session.orgId)
      .lt('service_date', service.service_date)
      .order('service_date', { ascending: false })
      .limit(1)
      .single();

    let trendLine = '';
    if (prevService) {
      const { count: prevCount } = await supabase
        .from('checkins')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', auth.session.orgId)
        .eq('service_id', prevService.id);

      if (typeof prevCount === 'number') {
        const diff = count - prevCount;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        trendLine = ` (${arrow}${Math.abs(diff)} from last service)`;
      }
    }

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color:#16243A;font-size:20px;">Attendance Report</h2>
        <p style="color:#486581;font-size:15px;line-height:1.7;">
          ${service.title || 'Service'} — ${serviceDateLabel}
        </p>
        <div style="background:#F8F4EE;border-radius:12px;padding:20px 24px;margin:16px 0;">
          <div style="font-size:22px;color:#16243A;font-weight:600;margin-bottom:4px;">${count} check-in${count === 1 ? '' : 's'}${trendLine}</div>
          <div style="font-size:13px;color:#7A6E60;line-height:1.8;margin-top:10px;">
            ${firstTimerCount} first-time visitor${firstTimerCount === 1 ? '' : 's'}<br/>
            ${maleCount} male · ${femaleCount} female
          </div>
        </div>
        <p style="color:#829ab1;font-size:13px;">Full details are attached as a CSV file.</p>
      </div>
    `;

    const result = await sendBrevoEmail(
      [{ email: org.admin_email }],
      `Attendance Report — ${service.title || 'Service'} (${serviceDateLabel})`,
      html,
      org.name,
      [{ content: csvBase64, name: filename }]
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send report email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('Email attendance report error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
