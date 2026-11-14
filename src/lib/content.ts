// Written material profiles: src/content/materials/<locale>/<slug>.md
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { site } from '../site.config';

export interface ProfileFrontmatter {
  summary: string;
  uses: { theme: 'green' | 'digital' | 'defence' | 'industrial'; title: string; text: string }[];
  sources?: { title: string; url: string }[];
}

interface MdModule {
  frontmatter: ProfileFrontmatter;
  Content: AstroComponentFactory;
}

const modules = import.meta.glob<MdModule>('../content/materials/*/*.md', { eager: true });

/** Profile in the requested language, falling back to the default language. */
export function profile(locale: string, slug: string): MdModule | null {
  return (
    modules[`../content/materials/${locale}/${slug}.md`] ??
    modules[`../content/materials/${site.defaultLocale}/${slug}.md`] ??
    null
  );
}
