import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================
// ATTENDANCE — PRESENT AND ABSENT, RECKONED BY DAY
// =============================================================
// Absence is only meaningful per *day*, not per service row. A church running
// a 9am and an 11am service would otherwise mark every 9am attendee "absent"
// from the 11am one. Everything here therefore keys off service_date and
// unions the check-ins across all services held on that date.
//
// "Absent" also only applies to people expected every week — members and
// leaders. A visitor who came once would otherwise appear absent forever,
// which makes the list noise rather than a follow-up queue.
// =============================================================

export interface AttendancePerson {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  role: string;
  total_checkins: number | null;
  last_checkin_at: string | null;
}

export interface PresentRecord {
  person: AttendancePerson | null;
  checked_in_at: string;
  is_first_time: boolean;
}

export interface AbsentRecord extends AttendancePerson {
  /** Whole weeks since this person last checked in; null if they never have. */
  weeksSinceLastVisit: number | null;
}

export interface DayAttendance {
  serviceDate: string;
  serviceIds: string[];
  present: PresentRecord[];
  absent: AbsentRecord[];
  expectedCount: number;
}

const PERSON_FIELDS = 'id, full_name, phone, email, gender, role, total_checkins, last_checkin_at';

function weeksSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24 * 7)));
}

/**
 * Who came and who didn't, for every service held on `serviceDate`.
 *
 * Absentees are sorted longest-away first so the top of the list is the part
 * that actually needs a phone call.
 */
export async function getDayAttendance(
  supabase: SupabaseClient,
  orgId: string,
  serviceDate: string
): Promise<DayAttendance> {
  // Every service on this calendar day, not just the one that was clicked.
  const { data: services } = await supabase
    .from('services')
    .select('id')
    .eq('org_id', orgId)
    .eq('service_date', serviceDate);

  const serviceIds = (services ?? []).map((s) => s.id as string);

  if (serviceIds.length === 0) {
    return { serviceDate, serviceIds: [], present: [], absent: [], expectedCount: 0 };
  }

  const { data: checkins } = await supabase
    .from('checkins')
    .select(`checked_in_at, is_first_time, person:people(${PERSON_FIELDS})`)
    .eq('org_id', orgId)
    .in('service_id', serviceIds)
    .order('checked_in_at', { ascending: true });

  // One row per person even if they checked into both services that day.
  const seen = new Set<string>();
  const present: PresentRecord[] = [];
  for (const row of (checkins ?? []) as unknown as PresentRecord[]) {
    const pid = row.person?.id;
    if (pid) {
      if (seen.has(pid)) continue;
      seen.add(pid);
    }
    present.push(row);
  }

  // Everyone expected on a normal Sunday. Visitors are excluded by design;
  // people with no email are kept, because the pastor may still phone them.
  const { data: expected } = await supabase
    .from('people')
    .select(PERSON_FIELDS)
    .eq('org_id', orgId)
    .eq('archived', false)
    .in('role', ['member', 'leader'])
    .order('full_name');

  const expectedPeople = (expected ?? []) as unknown as AttendancePerson[];

  const absent: AbsentRecord[] = expectedPeople
    .filter((p) => !seen.has(p.id))
    .map((p) => ({ ...p, weeksSinceLastVisit: weeksSince(p.last_checkin_at) }))
    .sort((a, b) => {
      // Never-attended sort last; otherwise longest absence first.
      if (a.weeksSinceLastVisit === null) return 1;
      if (b.weeksSinceLastVisit === null) return -1;
      return b.weeksSinceLastVisit - a.weeksSinceLastVisit;
    });

  return { serviceDate, serviceIds, present, absent, expectedCount: expectedPeople.length };
}

/**
 * Distinct service dates, most recent first. The "we miss you" automation
 * needs days rather than service rows — two services on one Sunday must count
 * as one opportunity to attend, not two.
 */
export async function getRecentServiceDates(
  supabase: SupabaseClient,
  orgId: string,
  limit: number
): Promise<string[]> {
  const { data } = await supabase
    .from('services')
    .select('service_date')
    .eq('org_id', orgId)
    .order('service_date', { ascending: false })
    .limit(limit * 4); // over-fetch: several rows can share one date

  const dates: string[] = [];
  for (const row of data ?? []) {
    const d = row.service_date as string;
    if (!dates.includes(d)) dates.push(d);
    if (dates.length === limit) break;
  }
  return dates;
}
