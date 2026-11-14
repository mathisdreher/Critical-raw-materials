import type { APIRoute } from 'astro';
import { worldGeometry } from '../lib/worldmap';

// One shared copy of the country outlines, cached by the browser and used by every map.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(worldGeometry()), { headers: { 'Content-Type': 'application/json' } });
