import type { APIRoute } from 'astro';

// The sitemap address depends on where the site is deployed, so the file is generated at build time.
export const GET: APIRoute = ({ site }) => {
  const base = (site ?? new URL('http://localhost:4321')).href.replace(/\/$/, '');
  const path = import.meta.env.BASE_URL.replace(/\/$/, '');
  const origin = new URL(base).origin;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}${path}/sitemap-index.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
