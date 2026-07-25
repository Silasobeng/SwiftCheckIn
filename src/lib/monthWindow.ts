// =============================================================
// TIMEZONE-AWARE MONTH / DAY WINDOWS
// =============================================================
// "This month", "last month" and "today" must be reckoned in the church's own
// timezone, not the device clock of whoever opens the dashboard. Check-in and
// giving timestamps are stored in UTC, so we convert each one into the church
// timezone before bucketing it.
//
// A church in Accra (UTC+0) is unaffected; one in a UTC+2/+3 country no longer
// sees a late-night record on the 31st fall into the wrong month.

/** Build a reusable formatter for one timezone (cheap to keep, costly to recreate per row). */
export function tzFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function parts(fmt: Intl.DateTimeFormat, value: Date | string) {
  const d = typeof value === 'string' ? new Date(value) : value;
  const p = fmt.formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** 'YYYY-MM' for the given instant, in the formatter's timezone. */
export function monthKeyOf(fmt: Intl.DateTimeFormat, value: Date | string): string {
  const { y, m } = parts(fmt, value);
  return `${y}-${m}`;
}

/** 'YYYY-MM-DD' for the given instant, in the formatter's timezone. */
export function dayKeyOf(fmt: Intl.DateTimeFormat, value: Date | string): string {
  const { y, m, d } = parts(fmt, value);
  return `${y}-${m}-${d}`;
}

/** The month key immediately before the given 'YYYY-MM'. */
export function prevMonthKey(ym: string): string {
  let [y, m] = ym.split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Human label for a month key, e.g. 'Mar 1–31, 2026'. Built in UTC so the
 *  label itself never drifts with the reader's device timezone. */
export function monthRangeLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${monthName} 1–${lastDay}, ${y}`;
}
