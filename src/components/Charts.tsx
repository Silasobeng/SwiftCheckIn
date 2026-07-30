'use client';

import { useState } from 'react';

// =============================================================
// CHARTS
// =============================================================
// Built in plain HTML/CSS rather than SVG so they stay responsive without a
// viewBox distorting the type, and without pulling in a charting library —
// this dashboard already polls every 30s and a ~100KB bundle for four charts
// is not a trade worth making.
//
// The rules these follow are not stylistic preferences:
//   · bars cap at 24px and the leftover band width stays as air
//   · touching marks are separated by a 2px gap in the SURFACE colour,
//     never by a stroke drawn around them
//   · data-ends round 4px, the baseline end stays square
//   · gridlines are solid 1px hairlines, one step off the surface — never dashed
//   · labels, values and legends wear ink tokens; only the mark wears the
//     series colour, so nothing depends on colour alone
//   · a legend appears for two or more series, never for one (the title
//     already names a single series)
//   · values are never printed on every mark — the axis, the legend and the
//     table view carry the rest

const INK = '#16243A';
const MUTED = '#7A6E60';
const LIGHT = '#A89D8E';

/** Round an axis maximum up to a clean number so ticks read 0 / 25 / 50. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

const num = (n: number) => n.toLocaleString('en-US');

/** Uppercase the first letter only. CSS `capitalize` uppercases *every* word,
 *  which turns a free-text occupation like "software developer and consultant"
 *  into "Software Developer And Consultant". Labels here are typed by hand at a
 *  kiosk, so they need tidying — but not that much. */
function sentenceCase(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// -------------------------------------------------------------
// Shared bits
// -------------------------------------------------------------

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: MUTED, fontWeight: 300 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: LIGHT, fontWeight: 300, margin: 0 }}>{children}</p>;
}

/** Every chart carrying values the reader can't otherwise reach gets one of
 *  these — a tooltip must enhance, never gate. */
function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
        fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: LIGHT, fontWeight: 500,
      }}
    >
      {open ? 'Chart' : 'Table'}
    </button>
  );
}

// -------------------------------------------------------------
// Stacked columns — attendance over time, split returning / first-time
// -------------------------------------------------------------

export interface TrendPoint { label: string; returning: number; firstTime: number }

export function StackedTrend({ data, height = 176 }: { data: TrendPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  if (data.length === 0) return <EmptyNote>No attendance data yet.</EmptyNote>;

  const totals = data.map((d) => d.returning + d.firstTime);
  const max = niceMax(Math.max(...totals, 1));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(max * f));
  const lastIdx = data.length - 1;

  if (table) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <TableToggle open onToggle={() => setTable(false)} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Month', 'Returning', 'First-time', 'Total'].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '7px 8px', color: MUTED, fontWeight: 500, borderBottom: '1px solid var(--chart-axis)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <td style={{ padding: '7px 8px', color: MUTED, fontWeight: 300 }}>{d.label}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: INK, fontVariantNumeric: 'tabular-nums' }}>{num(d.returning)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: INK, fontVariantNumeric: 'tabular-nums' }}>{num(d.firstTime)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: INK, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{num(d.returning + d.firstTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <TableToggle open={false} onToggle={() => setTable(true)} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {/* y ticks */}
        <div style={{ width: 30, height, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
          {ticks.map((t, i) => (
            <span key={i} style={{ fontSize: 10, color: LIGHT, textAlign: 'right', lineHeight: 1, fontVariantNumeric: 'tabular-nums', transform: 'translateY(-3px)' }}>{num(t)}</span>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: 'relative', height }}>
            {/* gridlines — solid hairlines, never dashed */}
            {ticks.map((_, i) => (
              <div key={i} aria-hidden style={{
                position: 'absolute', left: 0, right: 0, top: `${(i / (ticks.length - 1)) * 100}%`,
                height: 1, background: i === ticks.length - 1 ? 'var(--chart-axis)' : 'var(--chart-grid)',
              }} />
            ))}

            <div
              role="img"
              aria-label={`Attendance by month. ${data.map((d) => `${d.label}: ${d.returning + d.firstTime}`).join(', ')}.`}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 6 }}
            >
              {data.map((d, i) => {
                const total = d.returning + d.firstTime;
                const colPct = (total / max) * 100;
                const firstPct = total > 0 ? (d.firstTime / total) * 100 : 0;
                const isHover = hover === i;
                return (
                  <div
                    key={d.label}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', outline: 'none', cursor: 'default' }}
                  >
                    {isHover && (
                      <div style={{
                        position: 'absolute', bottom: `calc(${colPct}% + 8px)`, left: '50%', transform: 'translateX(-50%)',
                        background: INK, color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 11,
                        whiteSpace: 'nowrap', zIndex: 5, lineHeight: 1.5, pointerEvents: 'none',
                        boxShadow: '0 6px 20px rgba(22,36,58,0.22)',
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.label}</div>
                        <div style={{ opacity: 0.85 }}>Returning {num(d.returning)}</div>
                        <div style={{ opacity: 0.85 }}>First-time {num(d.firstTime)}</div>
                      </div>
                    )}

                    {/* Value on the cap — columns label at the top of the mark,
                        not under the axis where it reads as part of the tick.
                        Hidden while hovering so it can't collide with the tooltip. */}
                    {i === lastIdx && !isHover && total > 0 && (
                      <div style={{
                        position: 'absolute', bottom: `calc(${Math.max(colPct, 2)}% + 4px)`, left: '50%',
                        transform: 'translateX(-50%)', fontSize: 11, color: INK, fontWeight: 600,
                        whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
                      }}>{num(total)}</div>
                    )}

                    {/* the stack: capped at 24px so the band keeps its air */}
                    <div style={{
                      width: '100%', maxWidth: 24, height: `${Math.max(colPct, total > 0 ? 2 : 0)}%`,
                      display: 'flex', flexDirection: 'column',
                      // the 2px surface gap between segments — not a stroke
                      gap: d.firstTime > 0 && d.returning > 0 ? 2 : 0,
                      transition: 'height .35s ease', opacity: isHover ? 0.85 : 1,
                    }}>
                      {d.firstTime > 0 && (
                        <div style={{
                          height: `${firstPct}%`, background: 'var(--series-2)',
                          borderRadius: '4px 4px 0 0', minHeight: 3,
                        }} />
                      )}
                      <div style={{
                        flex: 1, background: 'var(--series-1)',
                        // only the topmost segment rounds; the baseline stays square
                        borderRadius: d.firstTime > 0 ? 0 : '4px 4px 0 0',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* x labels — every band the same single line, so no column's tick
              sits lower than its neighbours' */}
          <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
            {data.map((d) => (
              <div key={d.label} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                <div style={{ fontSize: 10, color: LIGHT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Legend items={[
        { label: 'Returning', color: 'var(--series-1)' },
        { label: 'First-time visitors', color: 'var(--series-2)' },
      ]} />
    </>
  );
}

// -------------------------------------------------------------
// Ranked horizontal bars — one series, so every bar takes slot 1.
// Colouring these by value would re-encode what bar length already says.
// -------------------------------------------------------------

export interface RankedRow { label: string; value: number; display?: string }

export function RankedBars({ rows, empty }: { rows: RankedRow[]; empty: string }) {
  if (rows.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.label} style={{ marginBottom: i === rows.length - 1 ? 0 : 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 5 }}>
            <span style={{ color: MUTED, fontWeight: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sentenceCase(r.label)}</span>
            <span style={{ color: INK, fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{r.display ?? num(r.value)}</span>
          </div>
          <div style={{ height: 8, background: 'var(--chart-grid)', borderRadius: 4 }}>
            <div style={{
              height: 8, width: `${Math.max((r.value / max) * 100, 1.5)}%`,
              background: 'var(--series-1)', borderRadius: '0 4px 4px 0', transition: 'width .35s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------
// Ordinal bars — for scales whose ORDER carries meaning (age bands).
// A ramp here is not decoration: it lets the reader see the ordering in
// the colour itself, which flat bars cannot do.
// -------------------------------------------------------------

const ORD = ['var(--ord-1)', 'var(--ord-2)', 'var(--ord-3)', 'var(--ord-4)', 'var(--ord-5)', 'var(--ord-6)'];

export function OrdinalBars({ rows, empty }: { rows: RankedRow[]; empty: string }) {
  if (rows.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.label} style={{ marginBottom: i === rows.length - 1 ? 0 : 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 5 }}>
            <span style={{ color: MUTED, fontWeight: 300 }}>{r.label}</span>
            <span style={{ color: INK, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{num(r.value)}</span>
          </div>
          <div style={{ height: 8, background: 'var(--chart-grid)', borderRadius: 4 }}>
            <div style={{
              height: 8, width: `${Math.max((r.value / max) * 100, 1.5)}%`,
              background: ORD[Math.min(i, ORD.length - 1)], borderRadius: '0 4px 4px 0', transition: 'width .35s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------
// Part-to-whole — one bar, segments summing to 100%.
// A two-slice pie is the classic wrong answer here; a single split bar
// reads faster and survives being 60px tall on a phone.
// -------------------------------------------------------------

export interface Segment { label: string; value: number; color: string }

export function SplitBar({ segments, empty }: { segments: Segment[]; empty: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyNote>{empty}</EmptyNote>;

  const shown = segments.filter((s) => s.value > 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height: 12, marginBottom: 4 }}>
        {shown.map((s, i) => (
          <div
            key={s.label}
            title={`${s.label}: ${num(s.value)}`}
            style={{
              width: `${(s.value / total) * 100}%`, background: s.color,
              borderRadius: i === 0 ? '6px 0 0 6px' : i === shown.length - 1 ? '0 6px 6px 0' : 0,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {shown.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: MUTED, fontWeight: 300, flex: 1 }}>{sentenceCase(s.label)}</span>
            <span style={{ color: INK, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{num(s.value)}</span>
            <span style={{ color: LIGHT, fontWeight: 300, width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
