// Public data handed to the Article 24 workbook: for each strategic raw
// material, the datasets a company may fall back on under Article 24(3).
import { materials, criticality, supply, trade, headline, topProducer } from './data';
import { fmtDate } from './format';

export interface PublicDataset {
  id: string;
  stage: 'extraction' | 'processing' | 'any';
  label: string;
  rows: { country: string; share: number }[];
}

export interface RiskMaterial {
  slug: string;
  name: string;
  short: string;
  sr: number | null;
  ir: number | null;
  top: { country: string; share: number; stage: string } | null;
  price: { label: string; change1y: number | null; date: string } | null;
  datasets: PublicDataset[];
}

const PROCESSING = /smelter|refinery|alumina|sponge|silicon metal|primary \(low/i;

function clean(rows: { country: string; share: number | null }[]): { country: string; share: number }[] {
  return rows
    .filter((r) => r.share !== null && r.share > 0 && !/^other/i.test(r.country))
    .slice(0, 8)
    .map((r) => ({ country: r.country.replace(/\s*\(.*\)$/, ''), share: Math.round((r.share as number) * 10) / 10 }));
}

export function riskMaterials(): RiskMaterial[] {
  return materials
    .filter((m) => m.strategic)
    .map((m) => {
      const c = criticality(m.slug);
      const datasets: PublicDataset[] = [];
      const s = supply(m.slug);
      for (const [i, t] of (s?.tables ?? []).entries()) {
        if (!t.comparable) continue;
        datasets.push({
          id: `usgs-${i}`,
          stage: PROCESSING.test(t.label) ? 'processing' : 'extraction',
          label: `World: ${t.label.toLowerCase()}, ${t.estimated_year} (USGS)`,
          rows: clean(t.rows.map((r) => ({ country: r.country, share: r.share_pct }))),
        });
      }
      for (const stage of ['extraction', 'processing'] as const) {
        const rows = (c?.global_producers ?? []).filter((r) => r.stage === stage);
        if (rows.length) datasets.push({ id: `eu-global-${stage}`, stage, label: `World: main suppliers at ${stage} stage (EU 2023 study)`, rows: clean(rows.map((r) => ({ country: r.country, share: r.share_pct }))) });
        const eu = (c?.eu_sourcing ?? []).filter((r) => r.stage === stage);
        if (eu.length) datasets.push({ id: `eu-sourcing-${stage}`, stage, label: `EU supply: main sources at ${stage} stage (EU 2023 study)`, rows: clean(eu.map((r) => ({ country: r.country, share: r.share_pct }))) });
      }
      for (const p of trade(m.slug)?.products ?? []) {
        if (!p.origins.rows.length) continue;
        datasets.push({
          id: `comext-${p.code}`,
          stage: 'any',
          label: `Extra-EU imports: ${p.label.toLowerCase()}, ${fmtDate(p.origins.from)} to ${fmtDate(p.origins.to)} (Eurostat)`,
          rows: clean(p.origins.rows.map((r) => ({ country: r.country, share: r.share_pct }))),
        });
      }
      const h = headline(m.slug);
      const top = topProducer(m.slug);
      return {
        slug: m.slug,
        name: m.name,
        short: m.short,
        sr: c?.supply_risk ?? null,
        ir: c?.import_reliance_pct ?? null,
        top: top ? { country: top.country, share: top.share, stage: top.stage } : null,
        price: h ? { label: h.label, change1y: h.change_1y_pct, date: h.latest_date } : null,
        datasets: datasets.filter((d) => d.rows.length > 0),
      };
    });
}

export const EU27_NAMES = [
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
  'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
];
