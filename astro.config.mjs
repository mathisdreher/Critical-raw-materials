import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE_URL and BASE_PATH are provided by the GitHub Pages workflow.
// Locally the site is served from the root.
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'en', locales: { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', nl: 'nl-NL', es: 'es-ES' } },
    }),
  ],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'de', 'nl', 'es'],
    routing: { prefixDefaultLocale: false },
  },
});
