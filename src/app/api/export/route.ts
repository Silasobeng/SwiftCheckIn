import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function csvEscape(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function createCsvResponse(rows: unknown[][], filename: string): NextResponse {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: NextRequest) {
  // Subscription enforced
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'people';
    const serviceId = searchParams.get('serviceId');

    // ATTENDANCE EXPORT
    if (type === 'attendance') {
      let query = supabase
        .from('checkins')
        .select('checked_in_at, is_first_time, person:people(full_name,phone,email,gender,role), service:services(service_date,title)')
        .eq('org_id', auth.session.orgId)
        .order('checked_in_at', { ascending: false });

      if (serviceId) {
        query = query.eq('service_id', serviceId);
      }

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = [
        ['Checked In At', 'Service Date', 'Service Title', 'Full Name', 'Phone', 'Email', 'Gender', 'Role', 'First Time'],
        ...(data ?? []).map((row: any) => [
          row.checked_in_at,
          row.service?.service_date ?? '',
          row.service?.title ?? '',
          row.person?.full_name ?? '',
          row.person?.phone ?? '',
          row.person?.email ?? '',
          row.person?.gender ?? '',
          row.person?.role ?? '',
          row.is_first_time ? 'Yes' : 'No',
        ]),
      ];

      return createCsvResponse(rows, 'attendance.csv');
    }

    // VISITORS EXPORT
    if (type === 'visitors') {
      const { data, error } = await supabase
        .from('people')
        .select('full_name, phone, email, gender, location, occupation, total_checkins, first_attendance_date, created_at')
        .eq('org_id', auth.session.orgId)
        .eq('role', 'visitor')
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = [
        ['Full Name', 'Phone', 'Email', 'Gender', 'Location', 'Occupation', 'Total Visits', 'First Visit', 'Added On'],
        ...(data ?? []).map((row: any) => [
          row.full_name,
          row.phone,
          row.email,
          row.gender,
          row.location,
          row.occupation,
          row.total_checkins,
          row.first_attendance_date,
          row.created_at?.split('T')[0],
        ]),
      ];

      return createCsvResponse(rows, 'visitors.csv');
    }

    // ABSENTEES EXPORT
    if (type === 'absentees') {
      const { data: recentServices } = await supabase
        .from('services')
        .select('id')
        .eq('org_id', auth.session.orgId)
        .order('service_date', { ascending: false })
        .limit(2);

      const recentServiceIds = recentServices?.map((s) => s.id) || [];

      if (recentServiceIds.length === 0) {
        return createCsvResponse([['No services found']], 'absentees.csv');
      }

      const { data: recentCheckins } = await supabase
        .from('checkins')
        .select('person_id')
        .eq('org_id', auth.session.orgId)
        .in('service_id', recentServiceIds);

      const checkedInPersonIds = new Set(recentCheckins?.map((c) => c.person_id) || []);

      const { data: allPeople } = await supabase
        .from('people')
        .select('id, full_name, phone, email, role, total_checkins, last_checkin_at')
        .eq('org_id', auth.session.orgId)
        .eq('archived', false)
        .in('role', ['member', 'leader'])
        .order('full_name');

      const absentees = (allPeople || []).filter((p) => !checkedInPersonIds.has(p.id));

      const rows = [
        ['Full Name', 'Phone', 'Email', 'Role', 'Total Check-ins', 'Last Seen'],
        ...absentees.map((row: any) => [
          row.full_name,
          row.phone,
          row.email,
          row.role,
          row.total_checkins,
          row.last_checkin_at?.split('T')[0] ?? 'Never',
        ]),
      ];

      return createCsvResponse(rows, 'absentees.csv');
    }

    // PEOPLE EXPORT (default)
    const { data, error } = await supabase
      .from('people')
      .select('full_name, phone, email, gender, role, location, occupation, total_checkins, first_attendance_date, last_checkin_at, archived')
      .eq('org_id', auth.session.orgId)
      .order('full_name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = [
      ['Full Name', 'Phone', 'Email', 'Gender', 'Role', 'Location', 'Occupation', 'Total Check-ins', 'First Attendance', 'Last Check-in', 'Archived'],
      ...(data ?? []).map((row: any) => [
        row.full_name,
        row.phone,
        row.email,
        row.gender,
        row.role,
        row.location,
        row.occupation,
        row.total_checkins,
        row.first_attendance_date,
        row.last_checkin_at?.split('T')[0],
        row.archived ? 'Yes' : 'No',
      ]),
    ];

    return createCsvResponse(rows, 'people.csv');
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
