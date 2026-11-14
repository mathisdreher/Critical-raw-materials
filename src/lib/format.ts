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

/** Prefix an internal path with the deployment base and, for non-default languages, the language segment. */
export function href(pathname: string, locale = 'en'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return locale === 'en' ? `${base}${p}` : `${base}/${locale}${p}`;
}

// ---------------------------------------------------------------- locale-aware formatting
const TAGS: Record<string, string> = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', nl: 'nl-NL', es: 'es-ES' };
const cacheNf = new Map<string, Intl.NumberFormat>();

function nfor(tag: string, key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const k = `${tag}|${key}`;
  let f = cacheNf.get(k);
  if (!f) {
    f = new Intl.NumberFormat(tag, opts);
    cacheNf.set(k, f);
  }
  return f;
}

export function localeTag(locale = 'en'): string {
  return TAGS[locale] ?? 'en-GB';
}

/** Number, percentage and date formatting in the conventions of a language. */
export function formatters(locale = 'en') {
  const tag = localeTag(locale);
  const month = new Intl.DateTimeFormat(tag, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const day = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const stamp = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
  const num = (v: number | null | undefined, maxDecimals?: number, na = 'n/a') => {
    if (v === null || v === undefined || !Number.isFinite(v)) return na;
    const a = Math.abs(v);
    const d = maxDecimals ?? (a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3);
    return nfor(tag, `n${d}`, { maximumFractionDigits: d }).format(v);
  };
  return {
    tag,
    number: num,
    /** Fixed number of decimals, for scores such as 1.8. */
    fixed(v: number | null | undefined, decimals = 1, na = 'n/a') {
      if (v === null || v === undefined || !Number.isFinite(v)) return na;
      return nfor(tag, `f${decimals}`, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
    },
    compact(v: number | null | undefined, na = 'n/a') {
      if (v === null || v === undefined || !Number.isFinite(v)) return na;
      const a = Math.abs(v);
      if (a < 1e4) return num(v);
      return nfor(tag, 'c', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    },
    pct(v: number | null | undefined, decimals = 1, signed = true, na = 'n/a') {
      if (v === null || v === undefined || !Number.isFinite(v)) return na;
      const f = nfor(tag, `p${decimals}${signed}`, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: signed ? 'exceptZero' : 'auto' });
      return `${f.format(v)}\u202f%`.replace('\u202f%', locale === 'en' ? '%' : '\u00a0%');
    },
    /** 2026-11-13 -> 13 Nov 2026, 2026-10 -> Oct 2026, 2025 -> 2025 */
    date(d: string) {
      const [y, m, dd] = d.split('-');
      if (!m) return y;
      const when = new Date(Date.UTC(Number(y), Number(m) - 1, Number(dd ?? '1')));
      return (dd ? day : month).format(when);
    },
    timestamp(iso: string, na = 'n/a') {
      return iso ? stamp.format(new Date(iso)) : na;
    },
  };
}

export type Formatters = ReturnType<typeof formatters>;
