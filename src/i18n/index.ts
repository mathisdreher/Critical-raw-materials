import { en, type Dict } from './en';
import { crmaEn, type CrmaDict } from './crma.en';

// Language files are picked up by name, so adding a language means adding its files
// (<lang>.ts, crma.<lang>.ts, data-labels.<lang>.ts) and listing it in LOCALES below.
type Mods = Record<string, Record<string, unknown>>;

function byLang<T>(mods: Mods, re: RegExp): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [file, mod] of Object.entries(mods)) {
    const m = file.match(re);
    if (m) out[m[1]] = Object.values(mod)[0] as T;
  }
  return out;
}

const dictionaries: Record<string, Dict> = {
  ...byLang<Dict>(import.meta.glob('./??.ts', { eager: true }) as Mods, /^\.\/([a-z]{2})\.ts$/),
  en,
};

export function ui(locale: string = 'en'): Dict {
  return dictionaries[locale] ?? en;
}

const crmaDictionaries: Record<string, CrmaDict> = {
  // the English file also exports constants, so it is registered explicitly and last
  ...byLang<CrmaDict>(import.meta.glob('./crma.??.ts', { eager: true }) as Mods, /^\.\/crma\.([a-z]{2})\.ts$/),
  en: crmaEn,
};

/** Content of the CRMA toolkit in the requested language. */
export function crma(locale: string = 'en'): CrmaDict {
  return crmaDictionaries[locale] ?? crmaEn;
}

/** Localised name of a material, from the interface dictionary. */
export function materialName(locale: string, slug: string): string {
  const t = ui(locale);
  return t.materialNames[slug] ?? en.materialNames[slug] ?? slug;
}

// Translations of labels that come with the data (series, products, tables, sources),
// keyed by their English text. Missing entries fall back to English.
const dataLabels: Record<string, Record<string, string>> = byLang<Record<string, string>>(import.meta.glob('./data-labels.??.ts', { eager: true }) as Mods, /^\.\/data-labels\.([a-z]{2})\.ts$/);

export function dataLabel(locale: string, text: string): string {
  return dataLabels[locale]?.[text] ?? text;
}

/** Label of a price series: import unit values are composed from the product name, others come from the data. */
export function seriesLabel(locale: string, s: { label: string; kind?: string; product?: string }): string {
  if (s.kind === 'import-unit-value' && s.product) return ui(locale).dataText.unitValue.replace('{product}', dataLabel(locale, s.product));
  return dataLabel(locale, s.label);
}

/** Note of a price series in the requested language, from its structured fields. */
export function noteText(locale: string, s: { note: string | null; note_key?: string; note_params?: Record<string, string | number> }): string | null {
  const n = ui(locale).dataText.notes;
  if (!s.note_key || !n[s.note_key]) return s.note;
  const fill = (tpl: string) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(s.note_params?.[k] ?? ''));
  let out = fill(n[s.note_key]);
  if (s.note_key === 'usgs' && s.note_params?.estimated) out += ` ${fill(n.usgsEstimate).replace('{year}', String(s.note_params.estimated))}`;
  return out;
}

export const LOCALES = ['en', 'fr', 'de', 'nl', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français', de: 'Deutsch', nl: 'Nederlands', es: 'Español' };
