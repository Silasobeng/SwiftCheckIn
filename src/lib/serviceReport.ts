import ExcelJS from 'exceljs';
import { timeFormatter } from './monthWindow';
import type { AbsentRecord, PresentRecord } from './attendance';
import type { GivingType } from '@/types';

// =============================================================
// SERVICE REPORT WORKBOOK
// =============================================================
// This used to be a CSV. Excel opens CSV as Windows-1252, which shredded every
// em dash, and it read phone numbers like "0201110001" as a number — turning
// the follow-up list into "2.01E+08" and making it useless for its one job.
// Neither is fixable in CSV, so the report is a real .xlsx: phones stored as
// text, money formatted as money, columns sized to their content.
//
// Leaders and members are reported separately on purpose. "Were all my leaders
// here?" is a roll call — every leader listed, present or not. "Who do I ring
// this week?" is a call list — only absent members, longest-away first. Mixing
// them buries the missing leader among a dozen missing members.

const NAVY = 'FF16243A';
const CREAM = 'FFF8F4EE';
const HAIRLINE = 'FFE4DFD5';
const MUTED = 'FF7A6E60';
const DANGER = 'FFB23B3B';
const SUCCESS = 'FF2E7D4E';

export const GIVING_TYPE_ORDER: GivingType[] = ['tithe', 'offering', 'seed', 'pledge', 'other'];
export const GIVING_TYPE_LABEL: Record<GivingType, string> = {
  tithe: 'Tithes',
  offering: 'Offerings',
  seed: 'Seed',
  pledge: 'Pledges',
  other: 'Other',
};

export interface ReportGivingRow {
  giver_name: string;
  amount: number;
  currency: string;
  giving_type: GivingType;
  giving_type_other: string | null;
  payment_method: string;
  created_at: string;
}

export interface ServiceReportInput {
  orgName: string;
  serviceTitle: string;
  serviceDateLabel: string;
  generatedLabel: string;
  timeZone: string;
  present: PresentRecord[];
  absent: AbsentRecord[];
  expectedCount: number;
  giving: ReportGivingRow[];
  currency: string;
}

type Sheet = ExcelJS.Worksheet;

/** Full-width navy band that opens each section. */
function section(ws: Sheet, label: string, span: number): void {
  ws.addRow([]);
  const row = ws.addRow([label]);
  ws.mergeCells(row.number, 1, row.number, span);
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  cell.alignment = { vertical: 'middle', indent: 1 };
  row.height = 21;
}

/** Column headings for a table inside a section. */
function tableHead(ws: Sheet, labels: string[]): void {
  const row = ws.addRow(labels);
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: NAVY } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } };
    cell.border = { bottom: { style: 'thin', color: { argb: HAIRLINE } } };
    cell.alignment = { vertical: 'middle' };
  });
  row.height = 18;
}

/** Church name / service / generated-at block at the top of every sheet. */
function titleBlock(ws: Sheet, input: ServiceReportInput, span: number): void {
  const t = ws.addRow([input.orgName]);
  ws.mergeCells(t.number, 1, t.number, span);
  t.getCell(1).font = { bold: true, size: 16, color: { argb: NAVY } };
  t.height = 24;

  const s = ws.addRow([`${input.serviceTitle} · ${input.serviceDateLabel}`]);
  ws.mergeCells(s.number, 1, s.number, span);
  s.getCell(1).font = { size: 11, color: { argb: MUTED } };

  const g = ws.addRow([`Generated ${input.generatedLabel}`]);
  ws.mergeCells(g.number, 1, g.number, span);
  g.getCell(1).font = { size: 9, italic: true, color: { argb: MUTED } };
}

/** Phone numbers must survive as typed — leading zero intact, never numeric. */
function phoneCell(ws: Sheet, rowNumber: number, col: number, phone: string | null): void {
  const cell = ws.getRow(rowNumber).getCell(col);
  cell.value = phone ?? '';
  cell.numFmt = '@';
}

function moneyFmt(currency: string): string {
  return `"${currency}" #,##0.00`;
}

/** 'mobile_money' -> 'Mobile Money'. Raw database enums shouldn't reach a pastor. */
function pretty(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export async function buildServiceReportWorkbook(input: ServiceReportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = input.orgName;
  wb.created = new Date();

  const fmtTime = timeFormatter(input.timeZone);
  const money = moneyFmt(input.currency);

  const leadersPresent = input.present.filter((r) => r.person?.role === 'leader');
  const leadersAbsent = input.absent.filter((p) => p.role === 'leader');
  const absentMembers = input.absent.filter((p) => p.role === 'member');
  const memberCount = input.present.filter((r) => r.person?.role === 'member').length;
  const visitorCount = input.present.filter((r) => r.person?.role === 'visitor').length;
  const firstTimers = input.present.filter((r) => r.is_first_time).length;
  const turnout = input.expectedCount > 0
    ? (input.expectedCount - input.absent.length) / input.expectedCount
    : null;

  const givingByType = GIVING_TYPE_ORDER
    .map((type) => {
      const rows = input.giving.filter((g) => g.giving_type === type);
      return { label: GIVING_TYPE_LABEL[type], rows, total: rows.reduce((s, g) => s + Number(g.amount), 0) };
    })
    .filter((g) => g.rows.length > 0);
  const givingTotal = input.giving.reduce((s, g) => s + Number(g.amount), 0);

  // ---------------------------------------------------------------
  // SUMMARY — everything a pastor wants in the first ten seconds
  // ---------------------------------------------------------------
  const sum = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  sum.columns = [{ width: 34 }, { width: 14 }, { width: 18 }, { width: 20 }];
  titleBlock(sum, input, 4);

  section(sum, 'ATTENDANCE', 4);
  const stats: [string, number | null][] = [
    ['Total present', input.present.length],
    ['Members', memberCount],
    ['Leaders', leadersPresent.length],
    ['Visitors', visitorCount],
    ['First-time visitors', firstTimers],
    ['Absent members', absentMembers.length],
    ['Absent leaders', leadersAbsent.length],
  ];
  for (const [label, value] of stats) {
    const row = sum.addRow([label, value]);
    row.getCell(1).font = { size: 11 };
    row.getCell(2).font = { size: 11, bold: true };
    row.getCell(2).alignment = { horizontal: 'left' };
  }
  if (turnout !== null) {
    const row = sum.addRow(['Turnout', turnout]);
    row.getCell(1).font = { size: 11 };
    row.getCell(2).font = { size: 11, bold: true };
    row.getCell(2).numFmt = '0%';
    row.getCell(2).alignment = { horizontal: 'left' };
  }

  section(sum, 'GIVING', 4);
  if (input.giving.length === 0) {
    sum.addRow(['No giving recorded for this date.']).getCell(1).font = { italic: true, color: { argb: MUTED } };
  } else {
    tableHead(sum, ['Type', 'Givers', 'Amount']);
    for (const g of givingByType) {
      const row = sum.addRow([g.label, g.rows.length, g.total]);
      row.getCell(3).numFmt = money;
    }
    const total = sum.addRow(['Total', input.giving.length, givingTotal]);
    total.eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.border = { top: { style: 'thin', color: { argb: HAIRLINE } } };
    });
    total.getCell(3).numFmt = money;
  }

  // Leaders are a roll call, not a call list — present ones listed too.
  section(sum, 'LEADERSHIP ROLL CALL', 4);
  if (leadersPresent.length + leadersAbsent.length === 0) {
    sum.addRow(['No leaders on record.']).getCell(1).font = { italic: true, color: { argb: MUTED } };
  } else {
    tableHead(sum, ['Leader', 'Status', 'Phone', 'Last Seen']);
    for (const r of leadersPresent) {
      const row = sum.addRow([r.person?.full_name ?? '', 'Present', '', `Today, ${fmtTime.format(new Date(r.checked_in_at))}`]);
      row.getCell(2).font = { bold: true, color: { argb: SUCCESS } };
      phoneCell(sum, row.number, 3, r.person?.phone ?? null);
      row.getCell(4).font = { color: { argb: MUTED } };
    }
    for (const p of leadersAbsent) {
      const row = sum.addRow([
        p.full_name,
        'Absent',
        '',
        p.last_checkin_at ? p.last_checkin_at.split('T')[0] : 'Never',
      ]);
      row.getCell(2).font = { bold: true, color: { argb: DANGER } };
      phoneCell(sum, row.number, 3, p.phone);
      row.getCell(4).font = { color: { argb: MUTED } };
    }
  }

  // ---------------------------------------------------------------
  // ATTENDANCE — who actually came
  // ---------------------------------------------------------------
  const att = wb.addWorksheet('Attendance', { views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }] });
  att.columns = [{ width: 10 }, { width: 26 }, { width: 16 }, { width: 30 }, { width: 10 }, { width: 12 }, { width: 12 }];
  titleBlock(att, input, 7);
  tableHead(att, ['Time', 'Full Name', 'Phone', 'Email', 'Gender', 'Role', 'First Time']);
  for (const r of input.present) {
    const row = att.addRow([
      fmtTime.format(new Date(r.checked_in_at)),
      r.person?.full_name ?? '',
      '',
      r.person?.email ?? '',
      pretty(r.person?.gender),
      pretty(r.person?.role),
      r.is_first_time ? 'Yes' : 'No',
    ]);
    phoneCell(att, row.number, 3, r.person?.phone ?? null);
    if (r.is_first_time) row.getCell(7).font = { bold: true, color: { argb: SUCCESS } };
  }
  if (input.present.length === 0) {
    att.addRow(['Nobody checked in for this service.']).getCell(1).font = { italic: true, color: { argb: MUTED } };
  }

  // ---------------------------------------------------------------
  // FOLLOW UP — absent members only, longest away first
  // ---------------------------------------------------------------
  const fu = wb.addWorksheet('Follow Up', { views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }] });
  fu.columns = [{ width: 26 }, { width: 16 }, { width: 30 }, { width: 14 }, { width: 12 }, { width: 12 }];
  titleBlock(fu, input, 6);
  tableHead(fu, ['Full Name', 'Phone', 'Email', 'Last Visit', 'Weeks Away', 'Total Visits']);
  for (const p of absentMembers) {
    const row = fu.addRow([
      p.full_name,
      '',
      p.email ?? '',
      p.last_checkin_at ? p.last_checkin_at.split('T')[0] : 'Never',
      p.weeksSinceLastVisit ?? '—',
      p.total_checkins ?? 0,
    ]);
    phoneCell(fu, row.number, 2, p.phone);
    // Three weeks away is the point where a quiet drift becomes a real absence.
    if ((p.weeksSinceLastVisit ?? 0) >= 3) row.getCell(5).font = { bold: true, color: { argb: DANGER } };
  }
  if (absentMembers.length === 0) {
    fu.addRow(['Every member attended — nobody to follow up.']).getCell(1).font = { italic: true, color: { argb: SUCCESS } };
  }

  // ---------------------------------------------------------------
  // GIVING — every giver named. Small churches have no finance team;
  // the pastor is the only oversight, so nothing is withheld here.
  // ---------------------------------------------------------------
  const gv = wb.addWorksheet('Giving', { views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }] });
  gv.columns = [{ width: 26 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 10 }];
  titleBlock(gv, input, 5);
  tableHead(gv, ['Giver Name', 'Type', 'Amount', 'Payment Method', 'Time']);
  for (const g of input.giving) {
    const label = g.giving_type === 'other'
      ? (g.giving_type_other || 'Other')
      : GIVING_TYPE_LABEL[g.giving_type];
    const row = gv.addRow([
      g.giver_name,
      label,
      Number(g.amount),
      pretty(g.payment_method),
      fmtTime.format(new Date(g.created_at)),
    ]);
    row.getCell(3).numFmt = moneyFmt(g.currency);
    row.getCell(4).alignment = { horizontal: 'left' };
    row.getCell(5).font = { color: { argb: MUTED } };
  }
  if (input.giving.length === 0) {
    gv.addRow(['No giving recorded for this date.']).getCell(1).font = { italic: true, color: { argb: MUTED } };
  } else {
    const total = gv.addRow(['Total', '', givingTotal, '', '']);
    total.eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.border = { top: { style: 'thin', color: { argb: HAIRLINE } } };
    });
    total.getCell(3).numFmt = money;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
