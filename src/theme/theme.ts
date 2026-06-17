export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'tfg-theme';

export function getStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    if (raw === 'light' || raw === 'dark') return raw;
    const data = JSON.parse(raw) as { state?: { theme?: Theme } };
    const t = data.state?.theme;
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* private mode / invalid json */
  }
  return null;
}

export function resolveTheme(stored: Theme | null): Theme {
  if (stored) return stored;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return 'light';
  }
  return 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

export function initThemeFromStorage(): Theme {
  const theme = resolveTheme(getStoredTheme());
  applyTheme(theme);
  return theme;
}
