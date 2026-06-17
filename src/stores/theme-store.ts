import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  applyTheme,
  initThemeFromStorage,
  type Theme,
  THEME_STORAGE_KEY,
} from '@/theme/theme';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const initial = initThemeFromStorage();

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: initial,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        get().setTheme(next);
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme);
      },
    },
  ),
);
