import { en, type Dict } from './en';
import { crmaEn, type CrmaDict } from './crma.en';

// Register additional languages here, for example: { en, fr }.
const dictionaries: Record<string, Dict> = { en };

export function ui(locale: string = 'en'): Dict {
  return dictionaries[locale] ?? en;
}

const crmaDictionaries: Record<string, CrmaDict> = { en: crmaEn };

/** Content of the CRMA toolkit in the requested language. */
export function crma(locale: string = 'en'): CrmaDict {
  return crmaDictionaries[locale] ?? crmaEn;
}
