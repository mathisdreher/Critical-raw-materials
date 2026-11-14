// Country names in the data are English strings from several sources (USGS,
// Eurostat, the EU study). This module maps them to ISO codes and back to a
// localised display name.
import iso from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

iso.registerLocale(en);

const ALIAS: Record<string, string> = {
  'DR Congo': 'CD',
  Congo: 'CG',
  'Türkiye': 'TR',
  Turkey: 'TR',
  'United States': 'US',
  "Côte d'Ivoire": 'CI',
  "Lao People's Democratic Republic": 'LA',
  Laos: 'LA',
  'Hong Kong': 'HK',
  Russia: 'RU',
  'Russian Federation': 'RU',
  'South Korea': 'KR',
  'North Korea': 'KP',
  Vietnam: 'VN',
  Iran: 'IR',
  Taiwan: 'TW',
  Syria: 'SY',
  Tanzania: 'TZ',
  Bolivia: 'BO',
  Venezuela: 'VE',
  Moldova: 'MD',
  'Czech Republic': 'CZ',
  Czechia: 'CZ',
  'United Kingdom': 'GB',
  Burma: 'MM',
  Myanmar: 'MM',
  Kosovo: 'XK',
  Palestine: 'PS',
};

const cache = new Map<string, string | null>();

/** ISO 3166-1 alpha-2 code for a country name found in the data, or null for aggregates such as "Other countries". */
export function iso2(name: string): string | null {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const n = name.replace(/\s*\(.*\)$/, '').replace(/’/g, "'").trim();
  let code: string | null = null;
  if (!/^(other|countries and|high seas|world)/i.test(n)) code = ALIAS[n] ?? iso.getAlpha2Code(n, 'en') ?? null;
  cache.set(name, code);
  return code;
}

export function numericToIso2(id: string | number | undefined): string | null {
  if (id === undefined || id === null || id === '') return null;
  return iso.numericToAlpha2(String(id).padStart(3, '0')) ?? null;
}

/** Short English names preferred on this site over the ICU long forms. */
export const EN_OVERRIDES: Record<string, string> = {
  CD: 'DR Congo',
  CG: 'Congo',
  KR: 'South Korea',
  KP: 'North Korea',
  HK: 'Hong Kong',
  LA: 'Laos',
  MM: 'Myanmar',
  PS: 'Palestine',
};

const displayNames = new Map<string, Intl.DisplayNames>();

/** Localised name of a country given its English name in the data (or its ISO code). Falls back to the input. */
export function countryName(nameOrCode: string, locale = 'en'): string {
  const code = /^[A-Z]{2}$/.test(nameOrCode) ? nameOrCode : iso2(nameOrCode);
  if (!code) return nameOrCode;
  if (locale === 'en' && EN_OVERRIDES[code]) return EN_OVERRIDES[code];
  let dn = displayNames.get(locale);
  if (!dn) {
    dn = new Intl.DisplayNames([locale], { type: 'region' });
    displayNames.set(locale, dn);
  }
  try {
    return dn.of(code) ?? nameOrCode;
  } catch {
    return nameOrCode;
  }
}
