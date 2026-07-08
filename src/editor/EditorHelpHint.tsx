import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const HELP_KEYS = [
  'selectBoxWindow',
  'selectBoxCrossing',
  'pan',
  'portContextMenu',
  'zoom',
  'delete',
  'undo',
  'multiSelect',
  'duplicate',
] as const;

export function EditorHelpHint() {
  const { t } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div
      className="editor-help-hint"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className="editor-help-hint__trigger"
        aria-label={t('editor.help.title')}
        aria-expanded={open}
        aria-controls={listId}
      >
        ?
      </button>
      {open && (
        <div id={listId} className="editor-help-hint__popover" role="tooltip">
          <p className="editor-help-hint__title">{t('editor.help.title')}</p>
          <ul className="editor-help-hint__list">
            {HELP_KEYS.map((key) => (
              <li key={key}>{t(`editor.help.${key}`)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
