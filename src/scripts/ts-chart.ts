// <ts-chart>: a single-series time-series chart (line or columns) with a series
// selector, range presets, crosshair tooltip, keyboard support and a table view.
// One series is shown at a time, so there is never a second y-axis.

type Pt = [string, number];
type Freq = 'daily' | 'monthly' | 'annual';

interface ChartSeries {
  id: string;
  label: string;
  unit: string;
  frequency: Freq;
  kind?: 'line' | 'column';
  group?: string;
  source?: string;
  sourceUrl?: string;
  note?: string | null;
  points: Pt[];
}

const NS = 'http://www.w3.org/2000/svg';
let TAG = 'en-GB';
const monthShort = (m: number) => new Intl.DateTimeFormat(TAG, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m, 1)));
interface Labels {
  ranges: Record<string, string>;
  sinceDate: string;
  noData: string;
  tableToggle: string;
  period: string;
  rangeLabel: string;
  source: string;
  latestOf: string;
  ariaSummary: string;
}
const DAY = 86400000;

const RANGES: Record<Freq, [string, number][]> = {
  daily: [['1M', 31], ['6M', 183], ['1Y', 366], ['5Y', 1827], ['Max', Infinity]],
  monthly: [['1Y', 366], ['5Y', 1827], ['10Y', 3653], ['Max', Infinity]],
  annual: [['Max', Infinity]],
};
const DEFAULT_RANGE: Record<Freq, string> = { daily: '1Y', monthly: '5Y', annual: 'Max' };

function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function html<K extends keyof HTMLElementTagNameMap>(name: K, cls?: string, text?: string) {
  const e = document.createElement(name);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function parseDate(d: string): number {
  const [y, m = '1', day = '1'] = d.split('-');
  return Date.UTC(Number(y), Number(m) - 1, Number(day));
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  if (!m) return y;
  const when = new Date(Date.UTC(Number(y), Number(m) - 1, Number(day ?? '1')));
  const opts: Intl.DateTimeFormatOptions = day ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(TAG, opts).format(when);
}

function fmtValue(v: number): string {
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3;
  return v.toLocaleString(TAG, { maximumFractionDigits: d });
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    min -= Math.abs(min) * 0.05 || 1;
    max += Math.abs(max) * 0.05 || 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

function tickLabel(v: number, top: number): string {
  if (top >= 1e6) return `${Number((v / 1e6).toPrecision(3))}M`;
  if (top >= 1e4) return `${Number((v / 1e3).toPrecision(3))}K`;
  return v.toLocaleString(TAG, { maximumFractionDigits: top < 10 ? 2 : top < 100 ? 1 : 0 });
}

function timeTicks(t0: number, t1: number, width: number): { t: number; label: string }[] {
  const span = t1 - t0;
  const maxTicks = Math.max(2, Math.floor(width / 78));
  const out: { t: number; label: string }[] = [];
  const d0 = new Date(t0);
  if (span > 500 * DAY) {
    const years = span / (365.25 * DAY);
    const step = [1, 2, 5, 10, 20].find((s) => years / s <= maxTicks) ?? 20;
    for (let y = Math.ceil(d0.getUTCFullYear() / step) * step; ; y += step) {
      const t = Date.UTC(y, 0, 1);
      if (t > t1) break;
      if (t >= t0) out.push({ t, label: String(y) });
    }
  } else if (span > 45 * DAY) {
    const months = span / (30.44 * DAY);
    const step = [1, 2, 3, 6].find((s) => months / s <= maxTicks) ?? 6;
    let y = d0.getUTCFullYear();
    let m = Math.ceil(d0.getUTCMonth() / step) * step;
    for (;;) {
      if (m > 11) {
        y += Math.floor(m / 12);
        m %= 12;
      }
      const t = Date.UTC(y, m, 1);
      if (t > t1) break;
      if (t >= t0) out.push({ t, label: m === 0 ? String(y) : monthShort(m) });
      m += step;
    }
  } else {
    const step = Math.max(1, Math.ceil(span / DAY / maxTicks));
    for (let t = Math.ceil(t0 / DAY) * DAY; t <= t1; t += step * DAY) {
      const d = new Date(t);
      out.push({ t, label: `${d.getUTCDate()} ${monthShort(d.getUTCMonth())}` });
    }
  }
  return out;
}

class TsChart extends HTMLElement {
  private labels!: Labels;
  private all: ChartSeries[] = [];
  private current!: ChartSeries;
  private range = '';
  private visible: Pt[] = [];
  private times: number[] = [];
  private hoverIndex = -1;
  private plot!: HTMLDivElement;
  private tip!: HTMLDivElement;
  private head!: HTMLDivElement;
  private foot!: HTMLDivElement;
  private rangeBox!: HTMLDivElement;
  private tableBox!: HTMLDetailsElement;

  connectedCallback() {
    const payload = this.querySelector('script[type="application/json"]');
    if (!payload?.textContent) return;
    const cfg = JSON.parse(payload.textContent) as { tag: string; labels: Labels; series: ChartSeries[] };
    TAG = cfg.tag;
    this.labels = cfg.labels;
    this.all = cfg.series.filter((s) => s.points.length > 1);
    if (!this.all.length) {
      this.append(html('p', 'small', this.labels.noData));
      return;
    }
    const wanted = this.getAttribute('series');
    this.current = this.all.find((s) => s.id === wanted) ?? this.all[0];
    this.build();
    this.select(this.current.id);
    new ResizeObserver(() => this.draw()).observe(this.plot);
  }

  private build() {
    const controls = html('div', 'chart-controls');
    if (this.all.length > 1) {
      const sel = html('select');
      sel.setAttribute('aria-label', this.getAttribute('select-label') ?? this.labels.rangeLabel);
      const groups = new Map<string, HTMLOptGroupElement>();
      for (const s of this.all) {
        const opt = html('option', undefined, s.label);
        opt.value = s.id;
        if (s.group) {
          let g = groups.get(s.group);
          if (!g) {
            g = html('optgroup');
            g.label = s.group;
            groups.set(s.group, g);
            sel.append(g);
          }
          g.append(opt);
        } else sel.append(opt);
      }
      sel.value = this.current.id;
      sel.addEventListener('change', () => this.select(sel.value));
      controls.append(sel);
    } else controls.append(html('span'));
    this.rangeBox = html('div', 'seg');
    this.rangeBox.setAttribute('role', 'group');
    this.rangeBox.setAttribute('aria-label', this.labels.rangeLabel);
    controls.append(this.rangeBox);

    this.head = html('div', 'chart-head');
    this.plot = html('div', 'chart-plot');
    this.tip = html('div', 'tip');
    this.tip.hidden = true;
    this.foot = html('div', 'chart-foot');
    this.tableBox = html('details', 'table-view');
    this.tableBox.append(html('summary', undefined, this.labels.tableToggle));
    this.tableBox.addEventListener('toggle', () => this.renderTable());
    this.append(controls, this.head, this.plot, this.foot, this.tableBox);
    this.plot.append(this.tip);
  }

  private select(id: string) {
    this.current = this.all.find((s) => s.id === id) ?? this.all[0];
    const ranges = RANGES[this.current.frequency];
    if (!ranges.some(([k]) => k === this.range)) this.range = DEFAULT_RANGE[this.current.frequency];
    this.rangeBox.replaceChildren();
    this.rangeBox.hidden = ranges.length < 2;
    for (const [key] of ranges) {
      const b = html('button', undefined, this.labels.ranges[key] ?? key);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(key === this.range));
      b.addEventListener('click', () => {
        this.range = key;
        for (const x of this.rangeBox.children) x.setAttribute('aria-pressed', String(x === b));
        this.update();
      });
      this.rangeBox.append(b);
    }
    this.update();
  }

  private update() {
    const s = this.current;
    const days = RANGES[s.frequency].find(([k]) => k === this.range)?.[1] ?? Infinity;
    const last = parseDate(s.points[s.points.length - 1][0]);
    const from = days === Infinity ? -Infinity : last - days * DAY;
    this.visible = s.points.filter((p) => parseDate(p[0]) >= from);
    if (this.visible.length < 2) this.visible = s.points.slice(-2);
    this.times = this.visible.map((p) => parseDate(p[0]));
    this.hoverIndex = -1;

    const [d1, v1] = this.visible[this.visible.length - 1];
    const v0 = this.visible[0][1];
    const change = v0 ? (v1 / v0 - 1) * 100 : null;
    const cv = html('span', 'cv', fmtValue(v1));
    const cu = html('span', 'cu', `${s.unit} · ${fmtDate(d1)}`);
    const cd = html('span', 'cd');
    if (change !== null && s.kind !== 'column') {
      const delta = html('span', 'delta', `${change > 0 ? '+' : ''}${change.toLocaleString(TAG, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${TAG.startsWith('en') ? '' : '\u00a0'}%`);
      delta.dataset.dir = change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat';
      cd.append(delta, document.createTextNode(` ${this.labels.sinceDate.replace('{date}', fmtDate(this.visible[0][0]))}`));
    }
    this.head.replaceChildren(cv, cu, cd);

    const src = html('span');
    src.append(`${this.labels.source}: `);
    if (s.sourceUrl) {
      const a = html('a', undefined, s.source ?? 'source');
      a.href = s.sourceUrl;
      a.rel = 'noopener';
      src.append(a);
    } else src.append(s.source ?? '');
    const note = html('span', undefined, s.note ?? '');
    this.foot.replaceChildren(src, note);
    this.draw();
    if (this.tableBox.open) this.renderTable();
  }

  private draw() {
    const w = Math.max(280, Math.floor(this.plot.clientWidth));
    if (!w || !this.visible.length) return;
    const h = w < 520 ? 240 : 300;
    const m = { l: 52, r: 14, t: 12, b: 26 };
    const pts = this.visible;
    const column = this.current.kind === 'column';
    const values = pts.map((p) => p[1]);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (column) lo = Math.min(0, lo);
    else {
      const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
      lo = lo - pad < 0 && lo >= 0 ? 0 : lo - pad;
      hi += pad;
    }
    const ticks = niceTicks(lo, hi, h < 260 ? 4 : 5);
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const t0 = this.times[0];
    const t1 = this.times[this.times.length - 1];
    const step = (t1 - t0) / Math.max(1, pts.length - 1);
    const padT = column ? step / 2 : 0;
    const x = (t: number) => m.l + ((t - (t0 - padT)) / (t1 - t0 + 2 * padT || 1)) * (w - m.l - m.r);
    const y = (v: number) => m.t + (1 - (v - y0) / (y1 - y0 || 1)) * (h - m.t - m.b);

    const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', tabindex: 0 });
    root.setAttribute(
      'aria-label',
      this.labels.ariaSummary
        .replace('{label}', this.current.label)
        .replace('{unit}', this.current.unit)
        .replace('{n}', String(pts.length))
        .replace('{from}', fmtDate(pts[0][0]))
        .replace('{to}', fmtDate(pts[pts.length - 1][0]))
        .replace('{latest}', fmtValue(values[values.length - 1])),
    );

    for (const tv of ticks) {
      const gy = Math.round(y(tv)) + 0.5;
      root.append(svg('line', { class: tv === y0 ? 'baseline' : 'gridline', x1: m.l, x2: w - m.r, y1: gy, y2: gy }));
      const label = svg('text', { x: m.l - 8, y: gy + 3.5, 'text-anchor': 'end' });
      label.textContent = tickLabel(tv, Math.max(Math.abs(y0), Math.abs(y1)));
      root.append(label);
    }
    for (const tk of timeTicks(t0, t1, w - m.l - m.r)) {
      const label = svg('text', { x: x(tk.t), y: h - 6, 'text-anchor': 'middle' });
      label.textContent = tk.label;
      root.append(label);
    }

    if (column) {
      const slot = (w - m.l - m.r) / pts.length;
      const bw = Math.max(1, Math.min(24, slot - (slot > 4 ? 2 : 0.5)));
      const base = y(Math.max(0, y0));
      pts.forEach((p, i) => {
        const cx = x(this.times[i]);
        const top = y(p[1]);
        const r = Math.min(4, bw / 2, Math.max(0, base - top));
        const d = `M${cx - bw / 2},${base}V${top + r}q0,${-r} ${r},${-r}h${bw - 2 * r}q${r},0 ${r},${r}V${base}Z`;
        root.append(svg('path', { class: 'col', d, 'data-i': i }));
      });
    } else {
      let d = '';
      pts.forEach((p, i) => {
        d += `${i ? 'L' : 'M'}${x(this.times[i]).toFixed(1)},${y(p[1]).toFixed(1)}`;
      });
      const baseY = y(y0);
      root.append(svg('path', { class: 'area', d: `${d}L${x(t1).toFixed(1)},${baseY}L${x(t0).toFixed(1)},${baseY}Z` }));
      root.append(svg('path', { class: 'line', d }));
      root.append(svg('circle', { class: 'dot', cx: x(t1), cy: y(values[values.length - 1]), r: 4 }));
    }

    const cross = svg('line', { class: 'crosshair', y1: m.t, y2: h - m.b, visibility: 'hidden' });
    const mark = svg('circle', { class: 'dot', r: 4.5, visibility: 'hidden' });
    root.append(cross, mark);

    const show = (i: number) => {
      if (i < 0 || i >= pts.length) return;
      this.hoverIndex = i;
      const px = x(this.times[i]);
      const py = y(pts[i][1]);
      cross.setAttribute('x1', String(Math.round(px) + 0.5));
      cross.setAttribute('x2', String(Math.round(px) + 0.5));
      cross.setAttribute('visibility', column ? 'hidden' : 'visible');
      mark.setAttribute('cx', String(px));
      mark.setAttribute('cy', String(py));
      mark.setAttribute('visibility', column ? 'hidden' : 'visible');
      if (column) root.querySelectorAll('.col').forEach((c, k) => c.classList.toggle('hl', k === i));
      const strong = html('strong', undefined, `${fmtValue(pts[i][1])} ${this.current.unit}`);
      const sub = html('span', undefined, fmtDate(pts[i][0]));
      this.tip.replaceChildren(strong, sub);
      this.tip.hidden = false;
      const tw = this.tip.offsetWidth;
      const left = px + 12 + tw > w ? px - 12 - tw : px + 12;
      this.tip.style.left = `${Math.max(0, left)}px`;
      this.tip.style.top = `${Math.max(0, Math.min(py - 20, h - 70))}px`;
    };
    const hide = () => {
      this.hoverIndex = -1;
      cross.setAttribute('visibility', 'hidden');
      mark.setAttribute('visibility', 'hidden');
      root.querySelectorAll('.col.hl').forEach((c) => c.classList.remove('hl'));
      this.tip.hidden = true;
    };
    const nearest = (clientX: number) => {
      const rect = root.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * w;
      const t = t0 - padT + ((px - m.l) / (w - m.l - m.r)) * (t1 - t0 + 2 * padT);
      let a = 0;
      let b = this.times.length - 1;
      while (b - a > 1) {
        const mid = (a + b) >> 1;
        if (this.times[mid] < t) a = mid;
        else b = mid;
      }
      return Math.abs(this.times[a] - t) <= Math.abs(this.times[b] - t) ? a : b;
    };
    root.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
    root.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
    root.addEventListener('pointerleave', hide);
    root.addEventListener('blur', hide);
    root.addEventListener('focus', () => show(this.hoverIndex < 0 ? pts.length - 1 : this.hoverIndex));
    root.addEventListener('keydown', (e) => {
      const cur = this.hoverIndex < 0 ? pts.length - 1 : this.hoverIndex;
      if (e.key === 'ArrowLeft') show(Math.max(0, cur - 1));
      else if (e.key === 'ArrowRight') show(Math.min(pts.length - 1, cur + 1));
      else if (e.key === 'Home') show(0);
      else if (e.key === 'End') show(pts.length - 1);
      else if (e.key === 'Escape') hide();
      else return;
      e.preventDefault();
    });

    this.plot.querySelector('svg')?.remove();
    this.plot.prepend(root);
  }

  private renderTable() {
    if (!this.tableBox.open) return;
    this.tableBox.querySelector('.table-scroll')?.remove();
    this.tableBox.querySelector('p')?.remove();
    const rows = [...this.visible].reverse();
    const cap = 400;
    const wrap = html('div', 'table-scroll');
    const table = html('table', 'data');
    const thead = html('thead');
    const hr = html('tr');
    hr.append(html('th', undefined, this.labels.period), html('th', 'r', this.current.unit));
    thead.append(hr);
    const tbody = html('tbody');
    for (const [d, v] of rows.slice(0, cap)) {
      const tr = html('tr');
      tr.append(html('td', undefined, fmtDate(d)), html('td', 'r', fmtValue(v)));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    wrap.append(table);
    this.tableBox.append(wrap);
    if (rows.length > cap) this.tableBox.append(html('p', 'small', this.labels.latestOf.replace('{n}', String(cap)).replace('{total}', String(rows.length))));
  }
}

if (!customElements.get('ts-chart')) customElements.define('ts-chart', TsChart);
