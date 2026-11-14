// Server-side assembly of the data handed to the <world-map> element.
import { materials } from './data';
import { mapItems, loadProjects, type StrategicProject } from './mapData';
import { ui, materialName, dataLabel } from '../i18n';
import { href } from './format';
import { EN_OVERRIDES } from './countries';

export function mapPayload(locale: string, fixed?: string) {
  const t = ui(locale);
  const projects = loadProjects()?.projects ?? [];
  const toProject = (p: StrategicProject) => ({
    name: p.name,
    iso: p.country_iso2,
    others: p.other_countries_iso2 ?? [],
    stages: p.stages ?? [],
    decision: p.decision,
    location: p.location,
    scope: p.scope,
  });
  const base = mapItems()
    .filter((i) => !fixed || i.slug === fixed)
    .map((i) => ({
      slug: i.slug,
      name: materialName(locale, i.slug),
      layers: i.layers.map((l) => ({ ...l, name: dataLabel(locale, l.label) })),
      projects: projects.filter((p) => p.materials.includes(i.slug)).map(toProject),
    }));
  const items =
    !fixed && projects.length > 0 ? [{ slug: 'all', name: t.map.allProjects, layers: [], projects: projects.map(toProject) }, ...base] : base;
  const { stages, ...strings } = t.map;
  return {
    locale,
    t: strings,
    stages,
    geometry: href('/map-geometry.json'),
    items: items.sort((a, b) => (a.slug === 'all' ? -1 : b.slug === 'all' ? 1 : a.name.localeCompare(b.name, locale))),
    fixed,
    overrides: locale === 'en' ? EN_OVERRIDES : {},
  };
}

export const hasMaterials = materials.length > 0;
