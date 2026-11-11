/** Money arrives either as Decimal strings ("2219.35") or numbers. */
export function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US');

export function formatMoney(v: string | number | null | undefined, opts: { sign?: boolean; currency?: boolean } = {}) {
  const n = toNumber(v);
  const s = money.format(Math.abs(n));
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return `${sign}${opts.currency ? 'ETB ' : ''}${s}`;
}

export function formatInt(v: number | null | undefined) {
  return int.format(v ?? 0);
}

export function formatDate(v: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', opts);
}

export function formatDateTime(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(v: string | null | undefined) {
  if (!v) return 'never';
  const diff = Date.now() - new Date(v).getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000], ['second', 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') return rtf.format(-Math.round(diff / ms), unit);
  }
  return '';
}

export function formatDuration(start: string, end: string | null) {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** "2026-11" → "Nov 2026" */
export function formatPeriod(p: string | null | undefined) {
  if (!p) return '—';
  const [y, m] = p.split('-').map(Number);
  if (!y || !m) return p;
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** ISO → "YYYY-MM-DD" for <input type="date"> */
export function toDateInput(v: string | null | undefined) {
  if (!v) return '';
  return v.slice(0, 10);
}

export function initials(name: string | null | undefined) {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}
