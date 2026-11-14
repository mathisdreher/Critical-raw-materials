// Build-time access to the JSON files written by the data pipeline (data/).
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.join(process.cwd(), 'data');

function read<T>(rel: string, fallback: T): T {
  const file = path.join(DATA, rel);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

export type Theme = 'green' | 'digital' | 'defence' | 'industrial';
export type Frequency = 'daily' | 'monthly' | 'annual';
export type Point = [string, number];

export interface Material {
  slug: string;
  name: string;
  short: string;
  group: string;
  strategic: boolean;
  themes: Theme[];
  trade: { code: string; label: string }[];
}

export interface Series {
  id: string;
  material: string;
  label: string;
  unit: string;
  frequency: Frequency;
  source: string;
  source_name: string;
  source_url: string;
  licence: string;
  note: string | null;
  note_key?: string;
  note_params?: Record<string, string | number>;
  kind?: string;
  product?: string;
  element?: string;
  updated: string;
  points: Point[];
}

export interface IndexEntry {
  id: string;
  material: string;
  label: string;
  unit: string;
  frequency: Frequency;
  source: string;
  source_name: string;
  latest_date: string;
  latest: number;
  change_pct: number | null;
  change_1y_pct: number | null;
  spark: number[];
  n: number;
  kind?: string;
  product?: string;
  element?: string;
}

export interface CountryShare {
  country: string;
  share_pct: number | null;
  stage?: string | null;
}

export interface Criticality {
  slug: string;
  supply_risk: number | null;
  economic_importance: number | null;
  import_reliance_pct: number | null;
  eol_rir_pct: number | null;
  assessed_stage: string | null;
  global_producers: CountryShare[];
  eu_sourcing: CountryShare[];
  is_strategic: boolean;
  notes: string | null;
  source_refs: string[];
}

export interface SupplyTable {
  label: string;
  unit: string;
  comparable: boolean;
  years: string[];
  estimated_year: string;
  world: Record<string, number>;
  reserves_unit: string | null;
  reserves_world: number | null;
  rows: { country: string; values: Record<string, number | null>; reserves: number | null; share_pct: number | null }[];
}

export interface Supply {
  slug: string;
  edition: number;
  source_name: string;
  source_url: string;
  tables: SupplyTable[];
}

export interface TradeProduct {
  code: string;
  label: string;
  primary: boolean;
  focus?: boolean;
  monthly: [string, number | null, number | null, number | null, number | null][];
  origins: {
    from: string;
    to: string;
    basis: 'tonnes' | 'value';
    total_t: number;
    total_eur: number;
    hhi: number | null;
    rows: { code: string; country: string; tonnes: number; eur: number; share_pct: number | null }[];
  };
}

export interface Trade {
  slug: string;
  source_name: string;
  source_url: string;
  latest_period: string;
  products: TradeProduct[];
}

export interface SourceStatus {
  name: string;
  url: string;
  licence: string;
  ok: boolean;
  last_attempt: string;
  last_success: string | null;
  detail: string;
}

const registry = read<{ materials: Material[] }>('registry/materials.json', { materials: [] });
const index = read<{ updated: string; series: IndexEntry[] }>('prices/index.json', { updated: '', series: [] });
const eu = read<{ materials: Criticality[]; sources?: { title: string; url: string }[]; caveats?: string[] }>(
  'eu/criticality.json',
  { materials: [] },
);
const status = read<{ updated: string; sources: Record<string, SourceStatus> }>('status.json', { updated: '', sources: {} });

export const materials: Material[] = [...registry.materials].sort((a, b) => a.name.localeCompare(b.name));
export const groups: string[] = [...new Set(registry.materials.map((m) => m.group))].sort();
export const priceIndex = index;
export const pipelineStatus = status;
export const euStudy = eu;

export function material(slug: string): Material {
  const m = materials.find((x) => x.slug === slug);
  if (!m) throw new Error(`unknown material ${slug}`);
  return m;
}

export function criticality(slug: string): Criticality | null {
  return eu.materials.find((x) => x.slug === slug) ?? null;
}

export function seriesFor(slug: string): Series[] {
  return index.series
    .filter((e) => e.material === slug)
    .map((e) => read<Series | null>(`prices/${e.id}.json`, null))
    .filter((s): s is Series => s !== null);
}

export function indexFor(slug: string): IndexEntry[] {
  return index.series.filter((e) => e.material === slug);
}

export function supply(slug: string): Supply | null {
  return read<Supply | null>(`supply/${slug}.json`, null);
}

export function trade(slug: string): Trade | null {
  return read<Trade | null>(`trade/${slug}.json`, null);
}

const MONTH_MS = 30.5 * 24 * 3600 * 1000;

/** True when a series has not been refreshed for longer than its frequency allows. */
export function isStale(e: { frequency: Frequency; latest_date: string }, now = Date.now()): boolean {
  const age = now - parseDate(e.latest_date);
  if (e.frequency === 'daily') return age > 0.5 * MONTH_MS;
  if (e.frequency === 'monthly') return age > 5 * MONTH_MS;
  return age > 36 * MONTH_MS;
}

/** Best available price series for a material: highest frequency first, market quotations before trade unit values. */
export function headline(slug: string): IndexEntry | null {
  const all = indexFor(slug);
  return all.find((e) => !isStale(e)) ?? all[0] ?? null;
}

export function parseDate(d: string): number {
  const [y, m = '1', day = '1'] = d.split('-');
  return Date.UTC(Number(y), Number(m) - 1, Number(day));
}

/** Share of the largest single origin in extra-EU imports of the primary product, trailing 12 months. */
export function importConcentration(slug: string) {
  const t = trade(slug);
  const p = t?.products.find((x) => x.focus) ?? t?.products.find((x) => x.primary);
  const top = p?.origins.rows[0];
  if (!p || !top || top.share_pct === null) return null;
  return { product: p.label, code: p.code, country: top.country, share: top.share_pct, hhi: p.origins.hhi, from: p.origins.from, to: p.origins.to, totalT: p.origins.total_t };
}

/** Largest producing country at the first production stage reported by USGS. */
export function topProducer(slug: string) {
  const s = supply(slug);
  const table = s?.tables.find((t) => t.comparable);
  const row = table?.rows.find((r) => r.share_pct !== null && r.country !== 'Other countries');
  if (!table || !row) return null;
  return { country: row.country, share: row.share_pct as number, stage: table.label, year: table.estimated_year };
}
