import type { APIRoute } from 'astro';
import { buildIcs } from '../../lib/ics';

export const GET: APIRoute = () => new Response(buildIcs('en'), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
