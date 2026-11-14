import type { APIRoute } from 'astro';
import { buildIcs } from '../../../lib/ics';
import { langPaths } from '../../../lib/locales';

export function getStaticPaths() {
  return langPaths();
}

export const GET: APIRoute = ({ params }) => new Response(buildIcs(params.lang as string), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
