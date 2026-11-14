const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtNumber(v: number | null | undefined, maxDecimals?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  const a = Math.abs(v);
  const d = maxDecimals ?? (a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3);
  return v.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1e9) return `${fmtNumber(v / 1e9, 1)}bn`;
  if (a >= 1e6) return `${fmtNumber(v / 1e6, 1)}M`;
  if (a >= 1e4) return `${fmtNumber(v / 1e3, 0)}K`;
  return fmtNumber(v);
}

export function fmtPct(v: number | null | undefined, decimals = 1, signed = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  const s = signed && v > 0 ? '+' : '';
  return `${s}${v.toFixed(decimals)}%`;
}

/** 2026-11-13 -> 13 Nov 2026, 2026-10 -> Oct 2026, 2025 -> 2025 */
export function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  if (!m) return y;
  if (!day) return `${MONTHS[Number(m) - 1]} ${y}`;
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function fmtTimestamp(iso: string): string {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

export function direction(v: number | null | undefined): 'up' | 'down' | 'flat' {
  if (v === null || v === undefined || Math.abs(v) < 0.005) return 'flat';
  return v > 0 ? 'up' : 'down';
}

/** Prefix an internal path with the deployment base (GitHub Pages serves from /<repo>/). */
export function href(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}
