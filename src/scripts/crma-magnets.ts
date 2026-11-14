// Permanent magnet requirements (Articles 28 and 29) for one product.
const form = document.getElementById('crma-magnets') as HTMLFormElement | null;
const out = document.getElementById('crma-magnets-result');
const raw = document.getElementById('crma-magnets-data')?.textContent;

if (form && out && raw) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { t, types, acts } = JSON.parse(raw) as { t: any; types: Record<string, string>; acts: Record<string, { due: string; entryIntoForce: string | null }> };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const el = (tag: string, cls?: string, text?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const list = (items: string[]) => {
    const ul = el('ul');
    for (const i of items) ul.append(el('li', undefined, i));
    return ul;
  };
  const plusYears = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + n);
    return d;
  };
  const fmt = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const later = (a: Date, b: Date) => (a > b ? a : b);

  const card = (title: string, ref: string, status: 'required' | 'notRequired' | 'verify' | null, ...body: (Node | string)[]) => {
    const a = el('article', 'result-card');
    const head = el('header');
    head.append(el('h4', undefined, title), el('span', 'badge', ref));
    a.append(head);
    if (status) {
      const s = el('p', `status ${status}`, `${status === 'required' ? '● ' : status === 'verify' ? '◐ ' : '○ '}${t.status[status]}`);
      a.append(s);
    }
    for (const b of body) a.append(typeof b === 'string' ? el('p', undefined, b) : b);
    return a;
  };

  const render = () => {
    const data = new FormData(form);
    const category = String(data.get('category') ?? '');
    const on = (name: string) => data.get(name) !== null;
    out.replaceChildren();
    if (category === '') {
      out.append(el('p', 'muted', t.empty));
      return;
    }
    if (category === 'other') {
      out.append(el('p', 'callout', t.notListed));
      return;
    }
    if (on('defence')) {
      out.append(el('p', 'callout', t.exemptDefence));
      return;
    }
    if (on('vehicleExempt')) {
      out.append(el('p', 'callout', t.exemptVehicle));
      return;
    }
    const cat = t.categories[Number(category)] as { label: string; late: boolean };
    const present = Object.keys(types).filter((id) => data.getAll('type').includes(id) || Number(data.get(`w-${id}`)) > 0);
    const contains = on('contains');
    const counted = present.filter((id) => id !== 'ferrite');
    const weights = counted.map((id) => String(data.get(`w-${id}`) ?? '').trim());
    const total = weights.reduce((n, w) => n + (Number(w) || 0), 0);
    const kg = total.toLocaleString('en-GB', { maximumFractionDigits: 3 });

    if (on('otherLaw')) out.append(el('p', 'callout warn', t.otherLawNote));

    // label
    const c = t.cards;
    if (contains) {
      const names = present.map((id) => types[id]).join(', ');
      out.append(card(c.label.title, c.label.ref, 'required', c.label.yes, list([c.label.items[0], `${c.label.items[1]} ${names || '…'}`])));
    } else out.append(card(c.label.title, c.label.ref, 'required', c.label.noMagnet));

    // data carrier
    if (contains) {
      const body: (Node | string)[] = [c.carrier.intro, list(on('motorsOnly') ? c.carrier.motors : c.carrier.items), el('p', 'small', c.carrier.keep)];
      if (on('passport')) body.push(el('p', 'small', c.carrier.passport));
      out.append(card(c.carrier.title, c.carrier.ref, 'required', ...body));
    } else out.append(card(c.carrier.title, c.carrier.ref, 'notRequired', c.carrier.none));

    // recycled content
    let recycledApplies = false;
    if (!contains || (present.length > 0 && counted.length === 0)) {
      out.append(card(c.recycled.title, c.recycled.ref, 'notRequired', contains ? c.recycled.ferriteOnly : c.carrier.none));
    } else if (counted.length === 0 || weights.every((w) => w === '')) {
      out.append(card(c.recycled.title, c.recycled.ref, 'verify', c.recycled.unknown));
    } else if (total > 0.2) {
      recycledApplies = true;
      out.append(card(c.recycled.title, c.recycled.ref, 'required', c.recycled.over.replace('{kg}', kg), c.recycled.yes, el('p', 'elements', c.recycled.elements), el('p', 'small', c.recycled.sales)));
    } else {
      out.append(card(c.recycled.title, c.recycled.ref, 'notRequired', c.recycled.below.replace('{kg}', kg)));
    }

    // dates
    const dl = el('dl');
    const labelEif = acts.art28Label.entryIntoForce;
    const calcEif = acts.art29Calculation.entryIntoForce;
    const add = (k: string, text: string, computed: Date | null) => {
      dl.append(el('dt', undefined, k));
      const dd = el('dd', undefined, text);
      if (computed) dd.append(el('strong', undefined, ` ${t.cards.dates.computed} ${fmt(computed)}.`));
      dl.append(dd);
    };
    add(c.dates.label, cat.late ? c.dates.labelLate : c.dates.labelGeneric, labelEif ? (cat.late ? later(plusYears(labelEif, 2), new Date('2029-05-24T00:00:00Z')) : plusYears(labelEif, 2)) : null);
    if (recycledApplies) add(c.dates.recycled, cat.late ? c.dates.recycledLate : c.dates.recycledGeneric, calcEif ? (cat.late ? plusYears(calcEif, 5) : later(plusYears(calcEif, 2), new Date('2027-05-24T00:00:00Z'))) : null);
    const body: (Node | string)[] = [dl];
    if (!labelEif || (recycledApplies && !calcEif)) body.push(el('p', 'small', c.dates.unconfirmed));
    out.append(card(c.dates.title, c.dates.ref, null, ...body));
  };

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  render();
}

export {};
