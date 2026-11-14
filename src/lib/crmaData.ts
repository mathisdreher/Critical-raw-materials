// Public data handed to the Article 24 workbook: for each strategic raw
// material, the datasets a company may fall back on under Article 24(3).
import { materials, criticality, supply, trade, headline, topProducer } from './data';
import { formatters } from './format';
import { countryName } from './countries';
import { crma, dataLabel, seriesLabel, materialName } from '../i18n';

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

function clean(rows: { country: string; share: number | null }[], locale: string): { country: string; share: number }[] {
  return rows
    .filter((r) => r.share !== null && r.share > 0 && !/^other/i.test(r.country))
    .slice(0, 8)
    .map((r) => ({ country: countryName(r.country.replace(/\s*\(.*\)$/, ''), locale), share: Math.round((r.share as number) * 10) / 10 }));
}

export function riskMaterials(locale = 'en'): RiskMaterial[] {
  const F = formatters(locale);
  const D = crma(locale).risk.datasets;
  const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
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
          label: fill(D.world, { what: dataLabel(locale, t.label), year: t.estimated_year }),
          rows: clean(t.rows.map((r) => ({ country: r.country, share: r.share_pct })), locale),
        });
      }
      for (const stage of ['extraction', 'processing'] as const) {
        const rows = (c?.global_producers ?? []).filter((r) => r.stage === stage);
        if (rows.length) datasets.push({ id: `eu-global-${stage}`, stage, label: fill(D.euGlobal, { stage: D.stages[stage] }), rows: clean(rows.map((r) => ({ country: r.country, share: r.share_pct })), locale) });
        const eu = (c?.eu_sourcing ?? []).filter((r) => r.stage === stage);
        if (eu.length) datasets.push({ id: `eu-sourcing-${stage}`, stage, label: fill(D.euSourcing, { stage: D.stages[stage] }), rows: clean(eu.map((r) => ({ country: r.country, share: r.share_pct })), locale) });
      }
      for (const p of trade(m.slug)?.products ?? []) {
        if (!p.origins.rows.length) continue;
        datasets.push({
          id: `comext-${p.code}`,
          stage: 'any',
          label: fill(D.imports, { product: dataLabel(locale, p.label), from: F.date(p.origins.from), to: F.date(p.origins.to) }),
          rows: clean(p.origins.rows.map((r) => ({ country: r.country, share: r.share_pct })), locale),
        });
      }
      const h = headline(m.slug);
      const top = topProducer(m.slug);
      return {
        slug: m.slug,
        name: materialName(locale, m.slug),
        short: m.short,
        sr: c?.supply_risk ?? null,
        ir: c?.import_reliance_pct ?? null,
        top: top ? { country: countryName(top.country, locale), share: top.share, stage: dataLabel(locale, top.stage) } : null,
        price: h ? { label: seriesLabel(locale, h), change1y: h.change_1y_pct, date: h.latest_date } : null,
        datasets: datasets.filter((d) => d.rows.length > 0),
      };
    });
}

export const EU27_ISO = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];

/** EU member state names in English and in the requested language, for the third-country test. */
export function euNames(locale: string): string[] {
  return [...new Set([...EU27_ISO.map((c) => countryName(c, 'en')), ...EU27_ISO.map((c) => countryName(c, locale)), 'Czech Republic'])];
}

export const EU27_NAMES = [
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
  'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
];
