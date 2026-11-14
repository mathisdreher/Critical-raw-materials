// <crma-risk>: Article 24 supply chain risk assessment workbook.
// Everything stays in the browser: state is kept in localStorage and can be
// exported or imported as JSON. No network request is made.

type Stage = 'extraction' | 'processing' | 'recycling';
const STAGES: Stage[] = ['extraction', 'processing', 'recycling'];
const STORE = 'crma-risk-v1';

interface Row {
  country: string;
  share: number | null;
}
interface Mat {
  products: string;
  volume: string;
  basis: 'supplier' | 'public' | 'mixed';
  mapping: Record<Stage, Row[]>;
  factors: string[];
  stock: number | null;
  alt: boolean;
  subst: boolean;
  recycled: number | null;
  override: '' | 'low' | 'medium' | 'high';
  justification: string;
  mitigations: Record<string, 'none' | 'planned' | 'done'>;
  notes: string;
}
interface State {
  company: { name: string; scope: string; author: string; date: string };
  selected: string[];
  mats: Record<string, Mat>;
}
interface Dataset {
  id: string;
  stage: 'extraction' | 'processing' | 'any';
  label: string;
  rows: { country: string; share: number }[];
}
interface PublicMat {
  slug: string;
  name: string;
  short: string;
  sr: number | null;
  ir: number | null;
  top: { country: string; share: number; stage: string } | null;
  price: { label: string; change1y: number | null; date: string } | null;
  datasets: Dataset[];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Strings = any;

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k in e && k !== 'list') (e as unknown as Record<string, unknown>)[k] = v;
    else e.setAttribute(k, String(v));
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

const today = () => new Date().toISOString().slice(0, 10);
const blankMat = (): Mat => ({
  products: '',
  volume: '',
  basis: 'supplier',
  mapping: { extraction: [], processing: [], recycling: [] },
  factors: [],
  stock: null,
  alt: false,
  subst: false,
  recycled: null,
  override: '',
  justification: '',
  mitigations: {},
  notes: '',
});
const blankState = (): State => ({ company: { name: '', scope: '', author: '', date: today() }, selected: [], mats: {} });

class CrmaRisk extends HTMLElement {
  private t!: Strings;
  private pub: PublicMat[] = [];
  private eu = new Set<string>();
  private base = '';
  private state: State = blankState();
  private panels!: HTMLElement;
  private report!: HTMLElement;
  private savedNote!: HTMLElement;
  private timer = 0;

  connectedCallback() {
    const payload = this.querySelector('script[type="application/json"]');
    if (!payload?.textContent) return;
    const cfg = JSON.parse(payload.textContent);
    this.t = cfg.t;
    this.pub = cfg.materials;
    this.eu = new Set(cfg.eu);
    this.base = cfg.base;
    this.load();
    this.build();
  }

  // ------------------------------------------------------------ persistence
  private load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) this.state = this.sanitise(JSON.parse(raw));
    } catch {
      /* storage unavailable or corrupted: start empty */
    }
  }

  private sanitise(input: unknown): State {
    const s = blankState();
    const i = (input ?? {}) as Partial<State>;
    Object.assign(s.company, i.company ?? {});
    const known = new Set(this.pub.map((m) => m.slug));
    s.selected = (i.selected ?? []).filter((x) => known.has(x));
    for (const slug of s.selected) {
      const m = { ...blankMat(), ...((i.mats ?? {})[slug] ?? {}) };
      m.mapping = { ...blankMat().mapping, ...(m.mapping ?? {}) };
      for (const st of STAGES) m.mapping[st] = (m.mapping[st] ?? []).map((r) => ({ country: String(r.country ?? ''), share: r.share === null || r.share === undefined ? null : Number(r.share) }));
      m.factors = Array.isArray(m.factors) ? m.factors.map(String) : [];
      s.mats[slug] = m;
    }
    return s;
  }

  private changed() {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify(this.state));
        this.savedNote.textContent = this.t.saved;
      } catch {
        this.savedNote.textContent = '';
      }
      this.renderReport();
    }, 250);
  }

  // ------------------------------------------------------------ calculations
  private stats(rows: Row[]) {
    const valid = rows.filter((r) => r.country.trim() && (r.share ?? 0) > 0);
    if (!valid.length) return null;
    const total = valid.reduce((n, r) => n + (r.share as number), 0);
    const top = valid.reduce((a, b) => ((b.share as number) > (a.share as number) ? b : a));
    const hhi = Math.round(valid.reduce((n, r) => n + (r.share as number) ** 2, 0));
    const third = !this.eu.has(top.country.trim());
    return { total, top, hhi, over: (top.share as number) > 65 && third };
  }

  private suggested(m: Mat): { level: 'low' | 'medium' | 'high'; score: number } {
    const tops = STAGES.map((s) => this.stats(m.mapping[s])).filter((x) => x !== null) as NonNullable<ReturnType<CrmaRisk['stats']>>[];
    let conc = 2;
    if (tops.length) {
      const max = Math.max(...tops.map((x) => x.top.share as number));
      conc = max > 65 ? 3 : max > 40 ? 2 : max > 20 ? 1 : 0;
    }
    const n = m.factors.length;
    const fac = n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
    const res = (m.alt ? 1 : 0) + ((m.stock ?? 0) >= 12 ? 1 : 0) + (m.subst ? 1 : 0);
    const score = Math.max(0, conc + fac - res);
    return { level: score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low', score };
  }

  private rating(m: Mat) {
    return m.override || this.suggested(m).level;
  }

  // ------------------------------------------------------------ layout
  private build() {
    const t = this.t;
    const c = this.state.company;
    const field = (label: string, key: keyof State['company'], type = 'text') =>
      h('label', { class: 'field' }, h('span', {}, label), h('input', { type, value: c[key], oninput: (e: Event) => { c[key] = (e.target as HTMLInputElement).value; this.changed(); } }));

    const chips = h('div', { class: 'mat-grid' });
    for (const p of this.pub) {
      const input = h('input', {
        type: 'checkbox',
        checked: this.state.selected.includes(p.slug),
        onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked;
          if (on) {
            this.state.selected.push(p.slug);
            this.state.mats[p.slug] ??= blankMat();
          } else this.state.selected = this.state.selected.filter((x) => x !== p.slug);
          this.renderPanels();
          this.changed();
        },
      });
      chips.append(h('label', { class: 'mat-chip pick' }, input, h('span', { class: 'sym' }, p.short), h('span', {}, p.name)));
    }

    this.panels = h('div', { class: 'risk-panels' });
    this.report = h('div', { class: 'report card' });
    this.savedNote = h('span', { class: 'small' });
    const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: (e: Event) => this.import(e) });

    this.append(
      h('section', { class: 'card' }, h('h2', {}, t.companyTitle), h('div', { class: 'field-grid' }, field(t.company.name, 'name'), field(t.company.scope, 'scope'), field(t.company.author, 'author'), field(t.company.date, 'date', 'date'))),
      h('section', { class: 'section' }, h('h2', {}, t.selectTitle), h('p', { class: 'muted' }, t.selectSub), chips),
      h('section', { class: 'section' }, h('h2', {}, t.materialsTitle), this.panels),
      h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', {}, t.reportTitle), this.savedNote),
        h('p', { class: 'muted', style: 'max-width:76ch' }, t.reportSub),
        h(
          'div',
          { class: 'actions no-print', style: 'margin:0 0 16px' },
          h('button', { class: 'btn', type: 'button', onclick: () => this.print() }, t.actions.print),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => this.export() }, t.actions.export),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => file.click() }, t.actions.import),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => this.clear() }, t.actions.clear),
          file,
        ),
        this.report,
      ),
    );
    this.renderPanels();
    this.renderReport();
  }

  private renderPanels() {
    this.panels.replaceChildren();
    if (!this.state.selected.length) {
      this.panels.append(h('p', { class: 'muted' }, this.t.materialsEmpty));
      return;
    }
    for (const p of this.pub) if (this.state.selected.includes(p.slug)) this.panels.append(this.panel(p));
  }

  private panel(p: PublicMat): HTMLElement {
    const t = this.t;
    const m = this.state.mats[p.slug];
    const badge = h('span', { class: 'badge rating' });
    const suggestedNote = h('span', { class: 'small' });
    const significant = h('p', { class: 'callout warn', hidden: true }, t.rating.significant);
    const stageStats: Partial<Record<Stage, HTMLElement>> = {};

    const refresh = () => {
      const sug = this.suggested(m);
      const level = this.rating(m);
      badge.textContent = `${t.rating.label}: ${t.rating[level]}`;
      badge.dataset.level = level;
      suggestedNote.textContent = `${t.rating.computed}: ${t.rating[sug.level]} (${sug.score})`;
      significant.hidden = level !== 'high';
      for (const st of STAGES) {
        const el = stageStats[st]!;
        const s = this.stats(m.mapping[st]);
        el.replaceChildren();
        if (!s) {
          el.append(t.mapping.nodata);
          continue;
        }
        el.append(`${t.mapping.top}: ${s.top.country} ${Math.round(s.top.share as number)}% · ${t.mapping.hhi} ${s.hhi.toLocaleString('en-GB')}`);
        if (s.over) el.append(h('span', { class: 'badge warn' }, `⚠ ${t.mapping.over}`));
        if (Math.abs(s.total - 100) > 1.5) el.append(h('span', { class: 'small' }, ` ${t.mapping.incomplete} ${Math.round(s.total)}%`));
      }
      this.changed();
    };

    const text = (label: string, key: 'products' | 'volume' | 'justification' | 'notes', area = false) => {
      const input = h(area ? 'textarea' : 'input', { value: m[key], rows: area ? 2 : undefined, oninput: (e: Event) => { m[key] = (e.target as HTMLInputElement).value; this.changed(); } });
      return h('label', { class: 'field' }, h('span', {}, label), input);
    };

    // mapping ------------------------------------------------------------
    const stageBlock = (st: Stage) => {
      const list = h('div', { class: 'rows' });
      const draw = () => {
        list.replaceChildren();
        m.mapping[st].forEach((row, i) => {
          list.append(
            h(
              'div',
              { class: 'row' },
              h('input', { type: 'text', value: row.country, placeholder: t.mapping.country, 'aria-label': t.mapping.country, oninput: (e: Event) => { row.country = (e.target as HTMLInputElement).value; refresh(); } }),
              h('input', { type: 'number', min: 0, max: 100, step: 'any', value: row.share ?? '', placeholder: '%', 'aria-label': t.mapping.share, oninput: (e: Event) => { const v = (e.target as HTMLInputElement).value; row.share = v === '' ? null : Number(v); refresh(); } }),
              h('button', { type: 'button', class: 'icon-btn', title: t.mapping.remove, 'aria-label': t.mapping.remove, onclick: () => { m.mapping[st].splice(i, 1); draw(); refresh(); } }, '×'),
            ),
          );
        });
      };
      const options = p.datasets.filter((d) => d.stage === st || d.stage === 'any');
      const select = h('select', { 'aria-label': t.mapping.prefill }, h('option', { value: '' }, t.mapping.prefillNone));
      for (const d of options) select.append(h('option', { value: d.id }, d.label));
      select.addEventListener('change', () => {
        const d = p.datasets.find((x) => x.id === select.value);
        if (!d) return;
        m.mapping[st] = d.rows.map((r) => ({ country: r.country, share: r.share }));
        if (m.basis === 'supplier') m.basis = 'mixed';
        select.value = '';
        draw();
        refresh();
        basisSelect.value = m.basis;
      });
      stageStats[st] = h('p', { class: 'small stage-stats' });
      draw();
      return h(
        'div',
        { class: 'stage' },
        h('h4', {}, t.stages[st]),
        list,
        h('button', { type: 'button', class: 'btn ghost small-btn', onclick: () => { m.mapping[st].push({ country: '', share: null }); draw(); } }, `+ ${t.mapping.add}`),
        options.length ? h('label', { class: 'field prefill' }, h('span', {}, t.mapping.prefill), select) : null,
        stageStats[st],
      );
    };

    const basisSelect = h('select', { onchange: (e: Event) => { m.basis = (e.target as HTMLSelectElement).value as Mat['basis']; this.changed(); } });
    for (const k of ['supplier', 'public', 'mixed']) basisSelect.append(h('option', { value: k, selected: m.basis === k }, t.basis[k]));

    // context from the monitor ---------------------------------------------
    const ctx = h('dl', { class: 'kv' });
    const add = (k: string, v: string | null) => v && ctx.append(h('dt', {}, k), h('dd', {}, v));
    add(t.context.sr, p.sr !== null ? p.sr.toFixed(1) : null);
    add(t.context.ir, p.ir !== null ? `${Math.round(p.ir)}%` : null);
    add(t.context.top, p.top ? `${p.top.country} ${Math.round(p.top.share)}% (${p.top.stage.toLowerCase()})` : null);
    add(t.context.price, p.price && p.price.change1y !== null ? `${p.price.change1y > 0 ? '+' : ''}${p.price.change1y}% (${p.price.label})` : null);

    // factors ----------------------------------------------------------------
    const factors = h('div', { class: 'choices cols' });
    for (const [id, label] of Object.entries(t.factors as Record<string, string>)) {
      factors.append(
        h('label', { class: 'choice' }, h('input', { type: 'checkbox', checked: m.factors.includes(id), onchange: (e: Event) => { const on = (e.target as HTMLInputElement).checked; m.factors = on ? [...m.factors, id] : m.factors.filter((x) => x !== id); refresh(); } }), ` ${label}`),
      );
    }

    // resilience and rating --------------------------------------------------
    const num = (label: string, key: 'stock' | 'recycled', max?: number) =>
      h('label', { class: 'field' }, h('span', {}, label), h('input', { type: 'number', min: 0, max, step: 'any', value: m[key] ?? '', oninput: (e: Event) => { const v = (e.target as HTMLInputElement).value; m[key] = v === '' ? null : Number(v); refresh(); } }));
    const tick = (label: string, key: 'alt' | 'subst') => h('label', { class: 'choice' }, h('input', { type: 'checkbox', checked: m[key], onchange: (e: Event) => { m[key] = (e.target as HTMLInputElement).checked; refresh(); } }), ` ${label}`);
    const override = h('select', { onchange: (e: Event) => { m.override = (e.target as HTMLSelectElement).value as Mat['override']; refresh(); } });
    for (const [v, l] of [['', t.rating.useComputed], ['low', t.rating.low], ['medium', t.rating.medium], ['high', t.rating.high]]) override.append(h('option', { value: v, selected: m.override === v }, l));

    // mitigation -------------------------------------------------------------
    const measures = h('div', { class: 'measures' });
    for (const [id, label] of Object.entries(t.mitigations as Record<string, string>)) {
      const sel = h('select', { 'aria-label': label, onchange: (e: Event) => { m.mitigations[id] = (e.target as HTMLSelectElement).value as 'none' | 'planned' | 'done'; this.changed(); } });
      for (const [v, l] of Object.entries(t.mitigationStatus as Record<string, string>)) sel.append(h('option', { value: v, selected: (m.mitigations[id] ?? 'none') === v }, l));
      measures.append(h('span', {}, label), sel);
    }

    const sec = (title: string, ref: string, ...body: Child[]) => h('div', { class: 'risk-sec' }, h('h3', {}, title, ' ', ref ? h('span', { class: 'badge' }, ref) : null), ...body);

    const panel = h(
      'details',
      { class: 'card risk-panel', open: true },
      h('summary', {}, h('span', { class: 'sym' }, p.short), h('strong', {}, p.name), badge),
      sec(t.sections.use, '', h('div', { class: 'field-grid' }, text(t.use.products, 'products'), text(t.use.volume, 'volume'), h('label', { class: 'field' }, h('span', {}, t.use.basis), basisSelect))),
      sec(t.sections.mapping, t.sections.mappingRef, h('p', { class: 'small' }, t.mapping.prefillHelp), h('div', { class: 'stages' }, ...STAGES.map(stageBlock))),
      sec(
        t.sections.factors,
        t.sections.factorsRef,
        h('div', { class: 'context' }, h('p', { class: 'fig-title' }, t.context.title), ctx, h('a', { href: `${this.base}${p.slug}/`, target: '_blank', rel: 'noopener' }, `${t.context.link} →`)),
        factors,
      ),
      sec(
        t.sections.vulnerability,
        t.sections.vulnerabilityRef,
        h('div', { class: 'field-grid' }, num(t.resilience.stock, 'stock'), num(t.resilience.recycled, 'recycled', 100)),
        h('div', { class: 'choices' }, tick(t.resilience.alt, 'alt'), tick(t.resilience.subst, 'subst')),
        h('div', { class: 'field-grid' }, h('label', { class: 'field' }, h('span', {}, t.rating.override, ' · ', suggestedNote), override), text(t.rating.justification, 'justification', true)),
        significant,
        h('details', { class: 'table-view' }, h('summary', {}, t.rating.method), h('p', { class: 'small', style: 'max-width:80ch' }, t.rating.methodText)),
      ),
      sec(t.sections.mitigation, t.sections.mitigationRef, measures, text(t.notes, 'notes', true)),
    );
    refresh();
    return panel;
  }

  // ------------------------------------------------------------ report
  private renderReport() {
    const t = this.t;
    const r = t.report;
    const s = this.state;
    this.report.replaceChildren();
    const mats = this.pub.filter((p) => s.selected.includes(p.slug));
    if (!mats.length) {
      this.report.append(h('p', { class: 'muted' }, r.empty));
      return;
    }
    const due = (() => {
      const d = new Date(s.company.date || today());
      if (Number.isNaN(d.getTime())) return '';
      d.setFullYear(d.getFullYear() + 3);
      return d.toISOString().slice(0, 10);
    })();
    const meta = h('dl', { class: 'kv' });
    const add = (k: string, v: string) => v && meta.append(h('dt', {}, k), h('dd', {}, v));
    add(t.company.name, s.company.name);
    add(t.company.scope, s.company.scope);
    add(t.company.author, s.company.author);
    add(t.company.date, s.company.date);
    add(r.next, due);

    const largest = (m: Mat) =>
      STAGES.map((st) => {
        const x = this.stats(m.mapping[st]);
        return x ? `${t.stages[st]}: ${x.top.country} ${Math.round(x.top.share as number)}%${x.over ? ' ⚠' : ''}` : null;
      })
        .filter(Boolean)
        .join(' · ') || t.mapping.nodata;

    const table = h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, r.material), h('th', {}, r.largest), h('th', {}, r.factors), h('th', {}, r.rating))));
    const body = h('tbody');
    for (const p of mats) {
      const m = s.mats[p.slug];
      const level = this.rating(m);
      body.append(h('tr', {}, h('td', {}, h('strong', {}, p.name)), h('td', {}, largest(m)), h('td', { class: 'r' }, String(m.factors.length)), h('td', {}, h('span', { class: 'badge rating', 'data-level': level }, t.rating[level]))));
    }
    table.append(body);

    const high = mats.filter((p) => this.rating(s.mats[p.slug]) === 'high');
    const significant = h('div', {});
    if (!high.length) significant.append(h('p', {}, r.noneSignificant));
    else {
      const ul = h('ul');
      for (const p of high) ul.append(h('li', {}, h('strong', {}, p.name), `: ${largest(s.mats[p.slug])}`));
      significant.append(ul);
    }

    const details = h('div', {});
    for (const p of mats) {
      const m = s.mats[p.slug];
      const level = this.rating(m);
      const block = h('div', { class: 'report-mat' }, h('h4', {}, p.name, ' ', h('span', { class: 'badge rating', 'data-level': level }, t.rating[level])));
      const kv = h('dl', { class: 'kv' });
      const row = (k: string, v: string) => v && kv.append(h('dt', {}, k), h('dd', {}, v));
      row(t.use.products, m.products);
      row(t.use.volume, m.volume);
      for (const st of STAGES) {
        const valid = m.mapping[st].filter((x) => x.country.trim() && (x.share ?? 0) > 0);
        if (valid.length) row(t.stages[st], valid.map((x) => `${x.country} ${x.share}%`).join(', '));
      }
      row(r.factors, m.factors.map((f) => t.factors[f]).filter(Boolean).join('; ') || r.none);
      row(t.resilience.stock, m.stock !== null ? String(m.stock) : '');
      row(t.resilience.recycled, m.recycled !== null ? `${m.recycled}%` : '');
      if (m.alt) row(t.resilience.alt, '✓');
      if (m.subst) row(t.resilience.subst, '✓');
      row(t.rating.justification, m.justification);
      const planned = Object.entries(m.mitigations).filter(([, v]) => v === 'planned').map(([k]) => t.mitigations[k]);
      const done = Object.entries(m.mitigations).filter(([, v]) => v === 'done').map(([k]) => t.mitigations[k]);
      row(`${r.measures}: ${t.mitigationStatus.done.toLowerCase()}`, done.join('; '));
      row(`${r.measures}: ${t.mitigationStatus.planned.toLowerCase()}`, planned.join('; '));
      if (!planned.length && !done.length) row(r.measures, r.none);
      row(r.sources, t.basis[m.basis]);
      row(t.notes, m.notes);
      block.append(kv);
      details.append(block);
    }

    const usesPublic = mats.some((p) => s.mats[p.slug].basis !== 'supplier');
    this.report.append(
      h('h3', { class: 'report-title' }, r.heading),
      h('p', { class: 'small' }, r.legal),
      meta,
      h('h4', {}, r.summary),
      h('div', { class: 'table-scroll' }, table),
      h('h4', {}, r.significant),
      significant,
      details,
    );
    if (usesPublic) this.report.append(h('p', { class: 'small' }, r.publicData));
  }

  // ------------------------------------------------------------ actions
  private print() {
    document.documentElement.classList.add('print-report');
    const done = () => {
      document.documentElement.classList.remove('print-report');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  private export() {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `crma-risk-assessment-${this.state.company.date || today()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  private async import(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      this.state = this.sanitise(JSON.parse(await file.text()));
      this.replaceChildren(this.querySelector('script[type="application/json"]') as Node);
      this.build();
      this.changed();
    } catch {
      window.alert('This file could not be read as an assessment.');
    }
    input.value = '';
  }

  private clear() {
    if (!window.confirm(this.t.actions.confirmClear)) return;
    this.state = blankState();
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* nothing stored */
    }
    this.replaceChildren(this.querySelector('script[type="application/json"]') as Node);
    this.build();
  }
}

if (!customElements.get('crma-risk')) customElements.define('crma-risk', CrmaRisk);
