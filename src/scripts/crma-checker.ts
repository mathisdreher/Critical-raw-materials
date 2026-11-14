// Obligations checker: reads the form, decides which obligation cards apply,
// and moves them into the three result groups. All rules are in this file.
const form = document.getElementById('crma-checker') as HTMLFormElement | null;
const aside = document.querySelector<HTMLElement>('.tool-result');

if (form && aside) {
  const pool = aside.querySelector<HTMLElement>('[data-pool]')!;
  const cards = new Map<string, HTMLElement>();
  pool.querySelectorAll<HTMLElement>('[data-o]').forEach((c) => cards.set(c.dataset.o as string, c));

  const radio = (name: string) => (form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '');
  const boxes = (name: string) => [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => i.value);

  const evaluate = () => {
    const size = radio('size');
    const tech = boxes('tech').length > 0;
    const products = boxes('products').length > 0;
    const magnets = radio('magnets');
    const types = boxes('mtype');
    const weight = radio('weight');
    const defence = boxes('defence').length > 0;
    const waste = radio('waste');
    const project = radio('project');
    const market = radio('market');

    // conditional questions
    form.querySelectorAll<HTMLElement>('[data-needs="products"]').forEach((el) => (el.hidden = !products));
    form.querySelectorAll<HTMLElement>('[data-needs="magnets-yes"]').forEach((el) => (el.hidden = magnets !== 'yes'));

    const out: Record<'applies' | 'check' | 'indirect', string[]> = { applies: [], check: [], indirect: [] };

    if (tech) {
      if (size === 'yes') out.applies.push('art24');
      else if (size === 'no') out.indirect.push('art24supplier');
      else out.check.push('art24check');
    }

    if (products) {
      if (defence) out.indirect.push('defence');
      else {
        out.applies.push('art28label');
        if (magnets === 'yes') out.applies.push('art28carrier');
        else if (magnets !== 'no') out.check.push('art28carrier');
        const counted = types.some((t) => t !== 'ferrite');
        if (magnets === 'yes') {
          if (counted && weight === 'yes') out.applies.push('art29');
          else if ((counted && weight !== 'no') || types.length === 0) out.check.push('art29check');
        } else if (magnets !== 'no') out.check.push('art29check');
      }
    }

    if (waste === 'yes') out.applies.push('art27');
    else if (waste === 'unsure') out.check.push('art27');

    if (project === 'recognised') out.applies.push('art8');
    else if (project === 'considering') out.indirect.push('art7');

    if (market === 'yes') out.indirect.push('art21', 'art31');
    if (out.applies.length) out.indirect.push('penalties');

    const answered = !!(size || tech || products || waste || project || market);
    const total = out.applies.length + out.check.length + out.indirect.length;
    aside.querySelector<HTMLElement>('[data-empty]')!.hidden = answered;
    aside.querySelector<HTMLElement>('[data-none]')!.hidden = !(answered && total === 0);

    // return every card to the pool, then place the selected ones
    cards.forEach((c) => pool.append(c));
    for (const group of ['applies', 'check', 'indirect'] as const) {
      const section = aside.querySelector<HTMLElement>(`[data-group="${group}"]`)!;
      const slot = section.querySelector<HTMLElement>('[data-slot]')!;
      section.hidden = out[group].length === 0;
      section.querySelector<HTMLElement>('[data-n]')!.textContent = String(out[group].length);
      for (const id of out[group]) {
        const card = cards.get(id);
        if (card) slot.append(card);
      }
    }
  };

  form.addEventListener('change', evaluate);
  evaluate();
}

export {};
