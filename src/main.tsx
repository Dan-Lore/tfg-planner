import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import { initThemeFromStorage } from '@/theme/theme';
import { initPackRestore } from '@/lib/restore-active-pack';
import '@/app/layout.css';
import { AppRoutes } from '@/app/routes';

initThemeFromStorage();
initPackRestore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoutes />
  </StrictMode>,
);
