// <world-map>: choropleth of country shares (production, reserves, EU import
// origin) with an optional overlay of Strategic Projects. The geometry comes
// from one cached JSON file and is drawn with the same SVG on every page.

interface Row {
  iso: string;
  share: number;
  value?: number;
}
interface Layer {
  id: string;
  kind: 'prod' | 'reserves' | 'imports';
  name: string;
  unit: string;
  year?: string;
  period?: string;
  source: string;
  sourceUrl: string;
  rows: Row[];
}
interface Project {
  name: string;
  iso: string;
  others?: string[];
  stages: string[];
  decision: string;
  location: string | null;
  scope: string;
}
interface Item {
  slug: string;
  name: string;
  layers: Layer[];
  projects: Project[];
}
interface Geometry {
  viewBox: string;
  countries: { iso2: string | null; en: string; d: string }[];
  centroid: Record<string, [number, number]>;
}
interface Payload {
  locale: string;
  t: Record<string, string>;
  stages: Record<string, string>;
  geometry: string;
  items: Item[];
  fixed?: string;
  overrides: Record<string, string>;
}

const NS = 'http://www.w3.org/2000/svg';
const SHARE_BOUNDS = [1, 5, 15, 30];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const bin = (v: number, bounds: number[]) => 1 + bounds.filter((b) => v >= b).length;

let geometryPromise: Promise<Geometry> | null = null;
const loadGeometry = (url: string) => (geometryPromise ??= fetch(url).then((r) => r.json() as Promise<Geometry>));

class WorldMap extends HTMLElement {
  private p!: Payload;
  private nf!: Intl.NumberFormat;
  private names!: Intl.DisplayNames;
  private geo!: Geometry;
  private paths = new Map<string, SVGPathElement>();
  private markers!: SVGGElement;
  private slug = '';
  private layerId = '';
  private overlay = false;
  private ui!: { material?: HTMLSelectElement; layers: HTMLElement; overlay: HTMLLabelElement; overlayBox: HTMLInputElement; legend: HTMLElement; list: HTMLElement; summary: HTMLElement; source: HTMLElement; stage: HTMLElement };

  async connectedCallback() {
    const raw = this.querySelector('script[type="application/json"]')?.textContent;
    if (!raw) return;
    this.p = JSON.parse(raw);
    this.nf = new Intl.NumberFormat(this.p.locale, { maximumFractionDigits: 1 });
    this.names = new Intl.DisplayNames([this.p.locale], { type: 'region' });
    this.build();
    try {
      this.geo = await loadGeometry(this.p.geometry);
    } catch {
      this.ui.stage.textContent = this.p.t.loadError;
      return;
    }
    this.draw();
    this.restore();
    this.render();
  }

  private name(iso: string | null, fallback = ''): string {
    if (!iso) return fallback;
    if (this.p.overrides[iso]) return this.p.overrides[iso];
    try {
      return this.names.of(iso) ?? fallback;
    } catch {
      return fallback;
    }
  }

  // ----------------------------------------------------------------- layout
  private build() {
    const t = this.p.t;
    const stage = el('div', 'map-stage');
    stage.append(el('p', 'small', t.loading));
    const controls = el('div', 'map-controls');
    let material: HTMLSelectElement | undefined;
    if (!this.p.fixed) {
      material = el('select');
      material.setAttribute('aria-label', t.material);
      for (const it of this.p.items) {
        const o = el('option', undefined, it.name);
        o.value = it.slug;
        material.append(o);
      }
      material.addEventListener('change', () => {
        this.slug = material!.value;
        this.layerId = '';
        this.render();
      });
      controls.append(material);
    }
    const layers = el('div', 'seg');
    layers.setAttribute('role', 'group');
    layers.setAttribute('aria-label', t.layer);
    const overlay = el('label', 'choice overlay-toggle');
    const overlayBox = el('input');
    overlayBox.type = 'checkbox';
    overlayBox.addEventListener('change', () => {
      this.overlay = overlayBox.checked;
      this.render();
    });
    overlay.append(overlayBox, document.createTextNode(` ${t.showProjects}`));
    controls.append(layers, overlay);

    const legend = el('div', 'map-legend');
    const list = el('div', 'map-list');
    const summary = el('p', 'sr-only');
    summary.setAttribute('aria-live', 'polite');
    const source = el('p', 'fig-note');
    const side = el('div', 'map-side');
    side.append(el('p', 'fig-title', t.ranking), list, source);
    const main = el('div', 'map-main');
    main.append(stage, legend);
    const layout = el('div', 'map-layout');
    layout.append(main, side);
    this.append(controls, layout, summary);
    this.ui = { material, layers, overlay, overlayBox, legend, list, summary, source, stage };
  }

  private draw() {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', this.geo.viewBox);
    svg.setAttribute('class', 'map-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', this.p.t.aria);
    const g = document.createElementNS(NS, 'g');
    for (const c of this.geo.countries) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', c.d);
      const name = this.name(c.iso2, c.en);
      path.dataset.name = name;
      path.dataset.tip = `${name}|${this.p.t.noData}`;
      if (c.iso2) {
        path.dataset.iso = c.iso2;
        this.paths.set(c.iso2, path);
      }
      g.append(path);
    }
    this.markers = document.createElementNS(NS, 'g');
    this.markers.setAttribute('class', 'map-markers');
    svg.append(g, this.markers);
    this.ui.stage.replaceChildren(svg);
  }

  // ----------------------------------------------------------------- state
  private restore() {
    const hash = decodeURIComponent(location.hash.slice(1));
    const [slug, layer] = hash.split('/');
    if (this.p.fixed) this.slug = this.p.fixed;
    else if (slug && this.p.items.some((i) => i.slug === slug)) {
      this.slug = slug;
      if (layer) this.layerId = layer;
    } else this.slug = this.p.items[0]?.slug ?? '';
    if (this.ui.material) this.ui.material.value = this.slug;
  }

  private item(): Item | undefined {
    return this.p.items.find((i) => i.slug === this.slug);
  }

  // ----------------------------------------------------------------- render
  private render() {
    const t = this.p.t;
    const item = this.item();
    // reset
    for (const path of this.paths.values()) {
      path.removeAttribute('data-bin');
      path.removeAttribute('tabindex');
      path.removeAttribute('aria-label');
      path.removeAttribute('role');
      path.dataset.tip = `${path.dataset.name}|${t.noData}`;
    }
    this.markers.replaceChildren();
    this.ui.list.replaceChildren();
    this.ui.legend.replaceChildren();
    this.ui.layers.replaceChildren();
    this.ui.source.replaceChildren();
    if (!item) return;
    if (!this.p.fixed) history.replaceState(null, '', `#${this.slug}${this.layerId ? `/${this.layerId}` : ''}`);

    const layer = item.layers.find((l) => l.id === this.layerId) ?? item.layers[0];
    this.layerId = layer?.id ?? '';
    this.ui.overlayBox.checked = this.overlay;

    // layer buttons
    for (const l of item.layers) {
      const b = el('button', undefined, `${t[`kind_${l.kind}`]}${l.kind === 'imports' || item.layers.filter((x) => x.kind === l.kind).length > 1 ? `: ${l.name}` : ''}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(l === layer));
      b.addEventListener('click', () => {
        this.layerId = l.id;
        this.render();
      });
      this.ui.layers.append(b);
    }
    this.ui.layers.hidden = item.layers.length < 2;

    const projectsOnly = !layer && item.projects.length > 0;
    if (!layer) {
      if (!projectsOnly) this.ui.list.append(el('p', 'muted', t.noLayers));
      this.ui.summary.textContent = projectsOnly ? t.projectsLegend : t.noLayers;
    } else this.paintLayer(layer);
    if (this.overlay || projectsOnly) this.paintProjects(item);
    this.ui.overlay.hidden = item.projects.length === 0 || projectsOnly;
  }

  private paintLayer(layer: Layer) {
    const t = this.p.t;
    const rows = [...layer.rows].sort((a, b) => b.share - a.share);
    for (const r of rows) {
      const path = this.paths.get(r.iso);
      if (!path) continue;
      path.dataset.bin = String(bin(r.share, SHARE_BOUNDS));
      path.tabIndex = 0;
      path.setAttribute('role', 'graphics-symbol');
      const lines = [`${this.nf.format(r.share)}%`, path.dataset.name as string];
      if (r.value !== undefined) lines.push(`${this.nf.format(r.value)} ${layer.unit}`);
      path.dataset.tip = lines.join('|');
      path.setAttribute('aria-label', `${path.dataset.name}: ${this.nf.format(r.share)}%`);
    }
    // legend
    const title = el('p', 'fig-sub', t[`legend_${layer.kind}`]);
    const ul = el('ul', 'legend-swatches');
    const labels = [`<${SHARE_BOUNDS[0]}%`, ...SHARE_BOUNDS.slice(0, -1).map((b, i) => `${b}–${SHARE_BOUNDS[i + 1]}%`), `≥${SHARE_BOUNDS[SHARE_BOUNDS.length - 1]}%`];
    labels.forEach((l, i) => {
      const li = el('li');
      const sw = el('i');
      sw.dataset.bin = String(i + 1);
      li.append(sw, l);
      ul.append(li);
    });
    const none = el('li');
    const ns = el('i');
    ns.className = 'none';
    none.append(ns, t.noData);
    ul.append(none);
    this.ui.legend.append(title, ul);

    // ranking (top 10)
    const bars = el('div', 'barlist');
    for (const r of rows.slice(0, 10)) {
      const name = this.name(r.iso, r.iso);
      const track = el('span', 'bl-track');
      const bar = el('span', 'bl-bar');
      bar.style.width = `${Math.min(100, (r.share / (rows[0].share || 1)) * 100)}%`;
      track.append(bar);
      track.dataset.tip = [`${this.nf.format(r.share)}%`, name, r.value !== undefined ? `${this.nf.format(r.value)} ${layer.unit}` : ''].filter(Boolean).join('|');
      track.tabIndex = 0;
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', track.dataset.tip.replace(/\|/g, ', '));
      const value = el('span', 'bl-value', `${this.nf.format(r.share)}%`);
      bars.append(el('span', 'bl-label', name), track, value);
    }
    this.ui.list.append(bars);
    const when = layer.year ? `, ${layer.year}` : layer.period ? `, ${layer.period.replace('/', ' → ')}` : '';
    const src = el('span');
    src.append(`${t.source}: `);
    const a = el('a', undefined, layer.source);
    a.href = layer.sourceUrl;
    a.rel = 'noopener';
    src.append(a, `. ${layer.name}${when}.`);
    this.ui.source.append(src);
    const top = rows[0];
    this.ui.summary.textContent = top ? t.summary.replace('{n}', String(rows.length)).replace('{top}', this.name(top.iso, top.iso)).replace('{pct}', this.nf.format(top.share)) : t.noLayers;
  }

  private paintProjects(item: Item) {
    const t = this.p.t;
    const byCountry = new Map<string, Project[]>();
    for (const pr of item.projects) {
      for (const iso of [pr.iso, ...(pr.others ?? [])]) {
        if (!iso) continue;
        const list = byCountry.get(iso) ?? [];
        list.push(pr);
        byCountry.set(iso, list);
      }
    }
    this.ui.legend.append(el('p', 'fig-sub', t.projectsLegend));
    // ranking of countries by number of projects when no other layer fills the list
    if (!this.ui.list.hasChildNodes()) {
      const bars = el('div', 'barlist');
      const ranked = [...byCountry].sort((a, b) => b[1].length - a[1].length).slice(0, 12);
      for (const [iso, list] of ranked) {
        const track = el('span', 'bl-track');
        const bar = el('span', 'bl-bar');
        bar.style.width = `${(list.length / ranked[0][1].length) * 100}%`;
        track.append(bar);
        bars.append(el('span', 'bl-label', this.name(iso, iso)), track, el('span', 'bl-value', String(list.length)));
      }
      this.ui.list.append(bars);
    }
    for (const [iso, list] of byCountry) {
      const c = this.geo.centroid[iso];
      if (!c) continue;
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', String(c[0]));
      circle.setAttribute('cy', String(c[1]));
      circle.setAttribute('r', String(3.5 + 2.2 * Math.sqrt(list.length)));
      circle.setAttribute('class', 'marker');
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('role', 'graphics-symbol');
      const name = this.name(iso, iso);
      const lines = [`${list.length} ${list.length === 1 ? t.projectOne : t.projectMany}`, name];
      for (const pr of list.slice(0, 5)) lines.push(`${pr.name}${pr.stages.length ? ` (${pr.stages.map((s) => this.p.stages[s] ?? s).join(', ')})` : ''}`);
      if (list.length > 5) lines.push(t.andMore.replace('{n}', String(list.length - 5)));
      circle.dataset.tip = lines.join('|');
      circle.setAttribute('aria-label', `${name}: ${list.length} ${list.length === 1 ? t.projectOne : t.projectMany}`);
      this.markers.append(circle);
    }
  }
}

if (!customElements.get('world-map')) customElements.define('world-map', WorldMap);

export {};
