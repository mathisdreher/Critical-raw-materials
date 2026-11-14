import { en, type Dict } from './en';

// Register additional languages here, for example: { en, fr }.
const dictionaries: Record<string, Dict> = { en };

export function ui(locale: string = 'en'): Dict {
  return dictionaries[locale] ?? en;
}
