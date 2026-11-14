// Calendar file with the dated duties that fall on companies, in one language.
import { crma } from '../i18n';
import { REG_URL } from '../i18n/crma.en';

const fold = (line: string) => line.replace(/(.{1,73})/g, '$1\r\n ').replace(/\r\n $/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function buildIcs(locale: string): string {
  const c = crma(locale);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Critical Raw Materials Monitor//CRMA deadlines//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(c.hub.title)}`];
  for (const d of c.deadlines.filter((x) => x.who === 'company')) {
    const day = d.date.replace(/-/g, '');
    const next = new Date(Date.parse(d.date) + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:crma-${day}-${d.ref.replace(/[^A-Za-z0-9]/g, '')}@crm-monitor`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next}`,
      fold(`SUMMARY:${esc(`CRMA ${d.ref}: ${d.what.split('.')[0]}`)}`),
      fold(`DESCRIPTION:${esc(`${d.what} ${c.regulationName}, ${d.ref}. ${REG_URL}`)}`),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
