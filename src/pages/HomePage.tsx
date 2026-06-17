import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePackStore } from '@/stores/pack-store';

export function HomePage() {
  const { t } = useTranslation();
  const activeEntry = usePackStore((s) => s.activeEntry);

  return (
    <div className="page">
      <h1>{t('home.title')}</h1>
      <p>{t('home.subtitle')}</p>
      {activeEntry && (
        <p className="card">
          Active pack: <strong>{activeEntry.modpackVersion}</strong>
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link to="/editor" className="btn">
          {t('home.openEditor')}
        </Link>
      </div>
      <div className="links">
        <a
          href="https://github.com/TerraFirmaGreg-Team/Modpack-Modern"
          target="_blank"
          rel="noreferrer"
        >
          {t('home.modpackLink')}
        </a>
        <a
          href="https://kirkmcdonald.github.io/"
          target="_blank"
          rel="noreferrer"
        >
          {t('home.inspiration')}
        </a>
      </div>
    </div>
  );
}
