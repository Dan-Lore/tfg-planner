import { useEffect, useRef, type WheelEvent as ReactWheelEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PackData } from '@/data/types';
import { getMachineName } from '@/data/pack-registry';
import type { AttachCandidate } from '@/lib/recipe-index';

export type PortAttachDirection = 'upstream' | 'downstream';

interface PortContextMenuProps {
  x: number;
  y: number;
  pack: PackData;
  lang: 'ru' | 'en';
  direction: PortAttachDirection;
  candidates: AttachCandidate[];
  onSelect: (candidate: AttachCandidate) => void;
  onClose: () => void;
}

function stopWheel(e: ReactWheelEvent) {
  e.stopPropagation();
}

export function PortContextMenu({
  x,
  y,
  pack,
  lang,
  direction,
  candidates,
  onSelect,
  onClose,
}: PortContextMenuProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: globalThis.MouseEvent) => {
      const target = e.target;
      if (
        rootRef.current &&
        target instanceof globalThis.Node &&
        !rootRef.current.contains(target)
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const titleKey =
    direction === 'downstream'
      ? 'editor.portMenu.addDownstream'
      : 'editor.portMenu.addUpstream';

  return (
    <div
      ref={rootRef}
      className="port-context-menu nowheel"
      style={{ left: x, top: y }}
      onWheel={stopWheel}
      role="menu"
    >
      <div className="port-context-menu__title">{t(titleKey)}</div>
      <ul className="port-context-menu__list">
        {candidates.length === 0 ? (
          <li className="port-context-menu__empty" role="presentation">
            {t('editor.portMenu.noRecipes')}
          </li>
        ) : (
          candidates.map((c) => {
            const machineName = getMachineName(pack, c.machineId, lang);
            const text = `${machineName} — ${c.label}`;
            return (
              <li key={`${c.recipeId}:${c.portId}`} role="presentation">
                <button
                  type="button"
                  className="port-context-menu__item"
                  role="menuitem"
                  title={text}
                  onClick={() => {
                    onSelect(c);
                    onClose();
                  }}
                >
                  {text}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
