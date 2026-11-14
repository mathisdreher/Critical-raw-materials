// Site-wide settings. Values prefixed PUBLIC_ can be overridden at build time
// through repository variables (Settings > Secrets and variables > Actions > Variables).
export const site = {
  name: 'Critical Raw Materials Monitor',
  shortName: 'CRM Monitor',
  tagline: 'Prices, supply and EU dependency for the 34 critical raw materials',
  repo: 'https://github.com/mathisdreher/Critical-raw-materials',
  // Tally form collecting interest for the news feed and price alerts (see README).
  tallyFormId: import.meta.env.PUBLIC_TALLY_FORM_ID ?? '',
  defaultLocale: 'en',
  locales: ['en'] as const,
};

export type Locale = (typeof site.locales)[number];
