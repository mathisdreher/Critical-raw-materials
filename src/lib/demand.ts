// EU demand projections from the JRC foresight study (2023), see data/demand/.
import fs from 'node:fs';
import path from 'node:path';

export interface DemandRow {
  key: string | null;
  baseline_year: number;
  baseline: number;
  lds: Record<string, number | null>;
  hds: Record<string, number | null>;
  tech: { name: string; share_pct: number }[];
}

export interface DemandSource {
  title: string;
  publisher: string;
  year: number;
  report_url: string;
  data_url: string;
  doi: string;
  licence: string;
}

interface DemandFile {
  source: DemandSource;
  materials: Record<string, { unit: string; rows: DemandRow[] }>;
}

let cache: DemandFile | null | undefined;

function load(): DemandFile | null {
  if (cache !== undefined) return cache;
  const file = path.join(process.cwd(), 'data', 'demand', 'jrc-foresight-2023.json');
  cache = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as DemandFile) : null;
  return cache;
}

export function demandSource(): DemandSource | null {
  return load()?.source ?? null;
}

export function demand(slug: string): { unit: string; rows: DemandRow[] } | null {
  return load()?.materials[slug] ?? null;
}

/** Growth multiples against 2020 for one row, low and high scenario. */
export function growth(r: DemandRow, year: '2030' | '2050') {
  const lo = r.lds[year];
  const hi = r.hds[year];
  return {
    low: lo != null && r.baseline > 0 ? lo / r.baseline : null,
    high: hi != null && r.baseline > 0 ? hi / r.baseline : null,
  };
}
