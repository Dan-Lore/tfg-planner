import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePackStore } from '@/stores/pack-store';
import { PackVersionPanel } from '@/components/PackVersionPanel';

export function HomePage() {
  const { t } = useTranslation();
  const activeEntry = usePackStore((s) => s.activeEntry);
  const activePack = usePackStore((s) => s.activePack);

  return (
    <div className="page home-page">
      <h1>{t('home.title')}</h1>
      <p>{t('home.subtitle')}</p>

      <PackVersionPanel />

      <div className="home-page__actions">
        {activePack && activeEntry ? (
          <Link to="/editor" className="btn">
            {t('home.openEditor')}
          </Link>
        ) : (
          <span className="btn btn--disabled" aria-disabled="true">
            {t('home.openEditor')}
          </span>
        )}
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
