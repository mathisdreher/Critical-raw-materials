// World geometry, computed once at build time from Natural Earth data
// (public domain, via the world-atlas package). The projection is Natural Earth.
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath, geoArea } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import world from 'world-atlas/countries-110m.json';
import { numericToIso2 } from './countries';

export interface MapCountry {
  iso2: string | null;
  en: string;
  d: string;
  cx: number;
  cy: number;
}

export interface WorldGeometry {
  viewBox: string;
  countries: MapCountry[];
  centroid: Record<string, [number, number]>;
}

let cached: WorldGeometry | null = null;

export function worldGeometry(): WorldGeometry {
  if (cached) return cached;
  const topo = world as unknown as Topology;
  const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
  const projection = geoNaturalEarth1().fitWidth(960, { type: 'Sphere' });
  const path = geoPath(projection).digits(1);
  const [[x0, y0], [x1, y1]] = path.bounds({ type: 'Sphere' });

  const countries: MapCountry[] = [];
  const centroid: Record<string, [number, number]> = {};
  for (const f of fc.features) {
    if (String(f.id) === '010') continue; // Antarctica
    const d = path(f);
    if (!d) continue;
    // centroid of the largest polygon, so that overseas parts do not pull it away (France, USA)
    let target: Feature<Polygon | MultiPolygon> = f;
    if (f.geometry.type === 'MultiPolygon') {
      const parts = f.geometry.coordinates.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: c } }) as Feature<Polygon>);
      target = parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
    }
    const [cx, cy] = path.centroid(target);
    const iso2 = numericToIso2(f.id as string);
    countries.push({ iso2, en: f.properties.name, d, cx: Math.round(cx * 10) / 10, cy: Math.round(cy * 10) / 10 });
    if (iso2) centroid[iso2] = [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10];
  }
  cached = { viewBox: `${Math.floor(x0)} ${Math.floor(y0)} ${Math.ceil(x1 - x0)} ${Math.ceil(y1 - y0)}`, countries, centroid };
  return cached;
}
