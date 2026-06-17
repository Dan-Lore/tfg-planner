import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { VersionSidebar } from '@/components/VersionSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import './layout.css';

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const location = useLocation();
  const flushMain = location.pathname === '/editor';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">{t('appName')}</div>
        <nav className="app-nav">
          <NavLink to="/" end>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/editor">{t('nav.editor')}</NavLink>
        </nav>
        <div className="header-controls">
          <ThemeToggle />
          <div className="lang-switch">
            <button
              type="button"
              className={lang === 'ru' ? 'active' : ''}
              onClick={() => i18n.changeLanguage('ru')}
            >
              RU
            </button>
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              onClick={() => i18n.changeLanguage('en')}
            >
              EN
            </button>
          </div>
        </div>
      </header>
      <div className="app-body">
        <VersionSidebar />
        <main className={`app-main ${flushMain ? 'app-main--flush' : ''}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
