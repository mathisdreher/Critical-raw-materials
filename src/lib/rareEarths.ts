// Element-level view of the rare earths, assembled from the pipeline data.
import fs from 'node:fs';
import path from 'node:path';
import { seriesFor, indexFor, supply, trade, criticality, type Series, type IndexEntry, type TradeProduct } from './data';

export interface Element {
  key: string;
  symbol: string;
  z: number;
  group: 'light' | 'heavy' | 'scandium' | 'none';
  slug: string;
  price?: string;
  magnet: boolean;
}

// Groups follow the 2023 EU criticality assessment. "magnet" marks the elements the
// Critical Raw Materials Act lists as strategic: Nd, Pr, Tb, Dy, Gd, Sm and Ce.
export const ELEMENTS: Element[] = [
  { key: 'lanthanum', symbol: 'La', z: 57, group: 'light', slug: 'light-rare-earths', price: 'la', magnet: false },
  { key: 'cerium', symbol: 'Ce', z: 58, group: 'light', slug: 'light-rare-earths', price: 'ce', magnet: true },
  { key: 'praseodymium', symbol: 'Pr', z: 59, group: 'light', slug: 'light-rare-earths', price: 'pr', magnet: true },
  { key: 'neodymium', symbol: 'Nd', z: 60, group: 'light', slug: 'light-rare-earths', price: 'nd', magnet: true },
  { key: 'promethium', symbol: 'Pm', z: 61, group: 'none', slug: '', magnet: false },
  { key: 'samarium', symbol: 'Sm', z: 62, group: 'light', slug: 'light-rare-earths', price: 'sm', magnet: true },
  { key: 'europium', symbol: 'Eu', z: 63, group: 'heavy', slug: 'heavy-rare-earths', price: 'eu', magnet: false },
  { key: 'gadolinium', symbol: 'Gd', z: 64, group: 'heavy', slug: 'heavy-rare-earths', price: 'gd', magnet: true },
  { key: 'terbium', symbol: 'Tb', z: 65, group: 'heavy', slug: 'heavy-rare-earths', price: 'tb', magnet: true },
  { key: 'dysprosium', symbol: 'Dy', z: 66, group: 'heavy', slug: 'heavy-rare-earths', price: 'dy', magnet: true },
  { key: 'holmium', symbol: 'Ho', z: 67, group: 'heavy', slug: 'heavy-rare-earths', price: 'ho', magnet: false },
  { key: 'erbium', symbol: 'Er', z: 68, group: 'heavy', slug: 'heavy-rare-earths', price: 'er', magnet: false },
  { key: 'thulium', symbol: 'Tm', z: 69, group: 'heavy', slug: 'heavy-rare-earths', magnet: false },
  { key: 'ytterbium', symbol: 'Yb', z: 70, group: 'heavy', slug: 'heavy-rare-earths', price: 'yb', magnet: false },
  { key: 'lutetium', symbol: 'Lu', z: 71, group: 'heavy', slug: 'heavy-rare-earths', price: 'lu', magnet: false },
  { key: 'yttrium', symbol: 'Y', z: 39, group: 'heavy', slug: 'heavy-rare-earths', price: 'y', magnet: false },
  { key: 'scandium', symbol: 'Sc', z: 21, group: 'scandium', slug: 'scandium', magnet: false },
];

const RARE_SLUGS = ['light-rare-earths', 'heavy-rare-earths'];
export const RARE_PAGE_SLUGS = [...RARE_SLUGS, 'scandium'];

function allSeries(): Series[] {
  return RARE_SLUGS.flatMap((s) => seriesFor(s)).filter((s) => s.element);
}

/** Oxide price series of an element (the oxide is the one quoted by USGS for most elements). */
export function elementSeries(price: string | undefined): Series | null {
  if (!price) return null;
  const list = allSeries().filter((s) => s.element === price);
  return list.find((s) => /oxide/i.test(s.label)) ?? list[0] ?? null;
}

export function elementEntry(price: string | undefined): IndexEntry | null {
  if (!price) return null;
  const list = RARE_SLUGS.flatMap((s) => indexFor(s)).filter((e) => e.element === price);
  return list.find((e) => /oxide/i.test(e.label)) ?? list[0] ?? null;
}

export function scandiumEntry(): IndexEntry | null {
  return indexFor('scandium').find((e) => e.frequency === 'annual') ?? null;
}

export function tradeGroup(code: string): 'metals' | 'compounds' | 'magnets' {
  if (code.startsWith('8505')) return 'magnets';
  if (code.startsWith('2846')) return 'compounds';
  return 'metals';
}

export interface RareTradeRow {
  product: TradeProduct;
  group: 'metals' | 'compounds' | 'magnets';
  china: number | null;
  topCountry: string | null;
  topShare: number | null;
  tonnes: number;
}

export function rareTrade(): { rows: RareTradeRow[]; period: string } {
  const products = RARE_SLUGS.flatMap((s) => trade(s)?.products ?? []);
  const rows = products
    .filter((p) => p.origins.rows.length > 0 && p.origins.total_t > 0)
    .map((p) => ({
      product: p,
      group: tradeGroup(p.code),
      china: p.origins.rows.find((r) => r.code === 'CN')?.share_pct ?? 0,
      topCountry: p.origins.rows[0]?.country ?? null,
      topShare: p.origins.rows[0]?.share_pct ?? null,
      tonnes: p.origins.total_t,
    }));
  const order = { metals: 0, compounds: 1, magnets: 2 };
  rows.sort((a, b) => order[a.group] - order[b.group] || b.tonnes - a.tonnes);
  return { rows, period: products[0]?.origins.to ?? '' };
}

export function magnetProduct(): TradeProduct | null {
  return (trade('light-rare-earths')?.products ?? []).find((p) => p.code === '85051110') ?? null;
}

export function miningShare() {
  const t = supply('light-rare-earths')?.tables[0];
  const row = t?.rows.find((r) => r.share_pct !== null && !/^other/i.test(r.country));
  return t && row ? { country: row.country, share: row.share_pct as number, year: t.estimated_year } : null;
}

/** Share of the leading country at the processing stage in the EU 2023 assessment. */
export function processingShare(slug: string) {
  const c = criticality(slug);
  const top = (c?.global_producers ?? []).filter((r) => r.stage === 'processing').sort((a, b) => (b.share_pct ?? 0) - (a.share_pct ?? 0))[0];
  return top ? { country: top.country, share: top.share_pct as number } : null;
}

export interface ElementAssessment {
  slug: string;
  symbol: string;
  group: string;
  supply_risk: number | null;
  economic_importance: number | null;
  import_reliance_pct: number | null;
  eol_rir_pct: number | null;
  notes: string | null;
}

/** Per-element EU assessment values, when the extraction file is present. */
export function elementAssessments(): ElementAssessment[] {
  const file = path.join(process.cwd(), 'data', 'eu', 'rare-earths.json');
  if (!fs.existsSync(file)) return [];
  const d = JSON.parse(fs.readFileSync(file, 'utf-8')) as { elements: ElementAssessment[] };
  return d.elements ?? [];
}

export interface IeaFigure {
  stage: string;
  country: string;
  share_pct: number | null;
  share_text: string | null;
  year: number | null;
  scope: string;
  page: string;
  quote: string;
  url: string;
}

/** Stage figures quoted from the IEA report "Rare Earth Elements" (April 2026, CC BY 4.0). */
export function ieaFigures() {
  const file = path.join(process.cwd(), 'data', 'eu', 'rare-earths.json');
  if (!fs.existsSync(file)) return null;
  const all = (JSON.parse(fs.readFileSync(file, 'utf-8')).stage_figures_iea ?? []) as IeaFigure[];
  const mining = all.find((f) => f.stage === 'mining' && f.share_pct === 60);
  const refining = all.find((f) => f.stage === 'separation' && f.share_pct === 91);
  const magnets = all.find((f) => f.stage === 'magnets' && f.share_pct === 94 && f.scope.startsWith('sintered permanent magnets (the type'));
  const japan = all.find((f) => f.stage === 'magnets' && f.country === 'Japan');
  return mining && refining && magnets && japan ? { mining, refining, magnets, japan } : null;
}
