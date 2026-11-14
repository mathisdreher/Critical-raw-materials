// Small page behaviours: hover tooltips for static marks, sortable and
// filterable tables, theme toggle.

// ---------------------------------------------------------------- tooltips
// Any element carrying data-tip="Value|Detail|Detail" gets a tooltip on hover and focus.
const tip = document.createElement('div');
tip.className = 'tip';
tip.id = 'tip-global';
tip.hidden = true;
document.body.append(tip);

function showTip(target: Element, x: number, y: number) {
  const parts = (target.getAttribute('data-tip') ?? '').split('|');
  const strong = document.createElement('strong');
  strong.textContent = parts[0];
  tip.replaceChildren(strong);
  for (const p of parts.slice(1)) {
    const s = document.createElement('span');
    s.textContent = p;
    tip.append(s);
  }
  tip.hidden = false;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = x + 14 + w > window.innerWidth ? x - 14 - w : x + 14;
  const top = y + 14 + h > window.innerHeight ? y - 14 - h : y + 14;
  tip.style.left = `${Math.max(4, left)}px`;
  tip.style.top = `${Math.max(4, top)}px`;
}

document.addEventListener('pointermove', (e) => {
  const t = (e.target as Element | null)?.closest?.('[data-tip]');
  if (t) showTip(t, e.clientX, e.clientY);
  else tip.hidden = true;
});
document.addEventListener('focusin', (e) => {
  const t = (e.target as Element | null)?.closest?.('[data-tip]');
  if (!t) return;
  const r = t.getBoundingClientRect();
  showTip(t, r.left + r.width / 2, r.top + r.height / 2);
});
document.addEventListener('focusout', () => {
  tip.hidden = true;
});
document.addEventListener('scroll', () => (tip.hidden = true), { passive: true });

// ---------------------------------------------------------------- sortable tables
for (const table of document.querySelectorAll<HTMLTableElement>('table[data-sortable]')) {
  const tbody = table.tBodies[0];
  table.querySelectorAll<HTMLTableCellElement>('th[data-sort]').forEach((th) => {
    th.tabIndex = 0;
    const sort = () => {
      const idx = th.cellIndex;
      const numeric = th.dataset.sort === 'num';
      const asc = th.getAttribute('aria-sort') !== 'ascending' && !(numeric && !th.hasAttribute('aria-sort'));
      table.querySelectorAll('th[aria-sort]').forEach((x) => x.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
      const key = (tr: HTMLTableRowElement) => {
        const cell = tr.cells[idx];
        const raw = cell.dataset.v ?? cell.textContent ?? '';
        if (!numeric) return raw.trim().toLowerCase();
        const n = parseFloat(raw);
        return Number.isNaN(n) ? null : n;
      };
      const rows = [...tbody.rows].sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        if (ka === null) return 1;
        if (kb === null) return -1;
        if (ka < kb) return asc ? -1 : 1;
        if (ka > kb) return asc ? 1 : -1;
        return 0;
      });
      tbody.append(...rows);
    };
    th.addEventListener('click', sort);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sort();
      }
    });
  });
}

// ---------------------------------------------------------------- table filters
// <div data-filter-for="tableId"> with a search input and buttons carrying
// data-filter="attr:value". Rows expose matching data-* attributes.
for (const box of document.querySelectorAll<HTMLElement>('[data-filter-for]')) {
  const table = document.getElementById(box.dataset.filterFor ?? '') as HTMLTableElement | null;
  if (!table) continue;
  const search = box.querySelector<HTMLInputElement>('input[type="search"]');
  const count = box.querySelector<HTMLElement>('[data-count]');
  const active = new Map<string, string>();
  const apply = () => {
    const q = (search?.value ?? '').trim().toLowerCase();
    let n = 0;
    for (const tr of table.tBodies[0].rows) {
      let ok = !q || (tr.dataset.search ?? tr.textContent ?? '').toLowerCase().includes(q);
      for (const [attr, value] of active) if (value && tr.dataset[attr] !== value) ok = false;
      tr.hidden = !ok;
      if (ok) n++;
    }
    if (count) count.textContent = String(n);
  };
  search?.addEventListener('input', apply);
  box.querySelectorAll<HTMLSelectElement>('select[data-attr]').forEach((sel) => {
    sel.addEventListener('change', () => {
      active.set(sel.dataset.attr as string, sel.value);
      apply();
    });
  });
  box.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
    seg.querySelectorAll<HTMLButtonElement>('button[data-attr]').forEach((b) => {
      b.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        active.set(b.dataset.attr as string, b.dataset.value ?? '');
        apply();
      });
    });
  });
}

// ---------------------------------------------------------------- theme toggle
const toggle = document.getElementById('theme-toggle');
toggle?.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try {
    localStorage.setItem('theme', root.dataset.theme);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
});
