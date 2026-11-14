// Builds the layers shown on the world map from the pipeline data.
import { materials, supply, trade } from './data';
import { iso2 } from './countries';
import fs from 'node:fs';
import path from 'node:path';

export interface MapRow {
  iso: string;
  share: number;
  value?: number;
}

export interface MapLayer {
  id: string;
  kind: 'prod' | 'reserves' | 'imports';
  label: string;
  unit: string;
  year?: string;
  period?: string;
  source: string;
  sourceUrl: string;
  rows: MapRow[];
}

export interface MapItem {
  slug: string;
  layers: MapLayer[];
}

export interface StrategicProject {
  name: string;
  decision: string;
  scope: 'eu' | 'third-country';
  country_iso2: string;
  location: string | null;
  materials: string[];
  stages: string[];
  promoter: string | null;
  other_countries_iso2?: string[];
}

export interface ProjectsFile {
  decisions: { id: string; date: string; scope: string; declared_count: number; url: string }[];
  projects: StrategicProject[];
}

// The official lists name two groups more broadly than the 2023 criticality list does.
const EXPAND: Record<string, string[]> = {
  'other:graphite (battery grade)': ['natural-graphite'],
  'other:rare earth elements for magnets': ['light-rare-earths', 'heavy-rare-earths'],
};

export function loadProjects(): ProjectsFile | null {
  const file = path.join(process.cwd(), 'data', 'projects', 'strategic-projects.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as ProjectsFile;
  for (const p of data.projects) p.materials = [...new Set(p.materials.flatMap((m) => EXPAND[m] ?? [m]))];
  return data;
}

export function mapItems(): MapItem[] {
  return materials.map((m) => {
    const layers: MapLayer[] = [];
    const s = supply(m.slug);
    (s?.tables ?? []).forEach((tb, i) => {
      if (!tb.comparable) return;
      const y = tb.estimated_year;
      const rows: MapRow[] = [];
      for (const r of tb.rows) {
        const code = iso2(r.country);
        if (!code || r.share_pct === null || r.share_pct <= 0) continue;
        rows.push({ iso: code, share: r.share_pct, value: r.values[y] ?? undefined });
      }
      if (rows.length)
        layers.push({ id: `prod-${i}`, kind: 'prod', label: tb.label, unit: tb.unit, year: y, source: s!.source_name, sourceUrl: s!.source_url, rows });
      if (i === 0 && tb.reserves_world) {
        const rr: MapRow[] = [];
        for (const r of tb.rows) {
          const code = iso2(r.country);
          if (!code || !r.reserves) continue;
          rr.push({ iso: code, share: Math.round((1000 * r.reserves) / tb.reserves_world) / 10, value: r.reserves });
        }
        if (rr.length) layers.push({ id: 'reserves', kind: 'reserves', label: tb.label, unit: tb.reserves_unit ?? tb.unit, year: '2025', source: s!.source_name, sourceUrl: s!.source_url, rows: rr });
      }
    });
    const t = trade(m.slug);
    for (const p of t?.products ?? []) {
      const rows: MapRow[] = [];
      for (const r of p.origins.rows) {
        if (r.share_pct === null || r.share_pct <= 0) continue;
        rows.push({ iso: r.code, share: r.share_pct, value: r.tonnes || undefined });
      }
      if (rows.length)
        layers.push({ id: `imp-${p.code}`, kind: 'imports', label: p.label, unit: 't', period: `${p.origins.from}/${p.origins.to}`, source: t!.source_name, sourceUrl: t!.source_url, rows });
    }
    return { slug: m.slug, layers };
  });
}
