import { LOCALES } from '../i18n';

/** Non-default languages: they are served under /<language>/. English is served from the root. */
export const OTHER_LOCALES = LOCALES.filter((l) => l !== 'en');

export function langPaths() {
  return OTHER_LOCALES.map((lang) => ({ params: { lang } }));
}
