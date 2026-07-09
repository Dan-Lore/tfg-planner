import type { LocalizedName } from '@/data/types';
import type { TagIndex } from '@/shared/tag-index';

export interface SuffixEntry {
  suffix: string;
  prefix: string;
}

export interface PrefixEntry {
  lead: string;
  tail: string;
  prefix: string;
}

export interface LangBundle {
  ru: Record<string, string>;
  en: Record<string, string>;
}

export interface PackLangArtifact {
  format: 'tfg-pack-lang';
  formatVersion: 1;
  modpackVersion: string;
  dataVersion: number;
  generatedAt: string;
  bundle: LangBundle;
  resolved?: Record<string, LocalizedName>;
}

export interface ResolveOptions {
  /** Pre-resolved fast path from pack.lang artifact. */
  resolved?: Record<string, LocalizedName>;
  /** Tag index for member fallback on `#…` ids. */
  tagIndex?: TagIndex;
  /** pack.meta names for tag member baked fallback. */
  bakedNames?: Map<string, LocalizedName>;
}

export interface ResolveContext extends ResolveOptions {
  suffixIndex?: { ru: SuffixEntry[]; en: SuffixEntry[] };
  prefixIndex?: { ru: PrefixEntry[]; en: PrefixEntry[] };
  /** Prevent infinite recursion on tag → member → tag. */
  skipTagMember?: boolean;
}

export type AppLang = 'ru' | 'en';
