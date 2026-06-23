import { useEffect, useRef, type WheelEvent as ReactWheelEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PackData } from '@/data/types';
import { getMachineName } from '@/data/pack-registry';
import type { AttachCandidate } from '@/lib/recipe-index';
import type { TfgpBufferKind } from '@/schema/tfgp';

const BUFFER_MENU_KEYS: Record<TfgpBufferKind, string> = {
  start_buffer: 'editor.portMenu.addStartBuffer',
  intermediate_buffer: 'editor.portMenu.addIntermediateBuffer',
  end_buffer: 'editor.portMenu.addEndBuffer',
};

export type PortAttachDirection = 'upstream' | 'downstream';

interface PortContextMenuProps {
  x: number;
  y: number;
  pack: PackData;
  lang: 'ru' | 'en';
  direction: PortAttachDirection;
  portSide: 'in' | 'out';
  bufferOptions: TfgpBufferKind[];
  candidates: AttachCandidate[];
  onSelectBuffer: (kind: TfgpBufferKind) => void;
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
  portSide,
  bufferOptions,
  candidates,
  onSelectBuffer,
  onSelect,
  onClose,
}: PortContextMenuProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: globalThis.MouseEvent) => {
      if (e.button !== 0) return;
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
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
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
      {bufferOptions.length > 0 && (
        <>
          <div className="port-context-menu__title">{t('editor.portMenu.buffers')}</div>
          <ul className="port-context-menu__list">
            {bufferOptions.map((kind) => (
              <li key={kind} role="presentation">
                <button
                  type="button"
                  className="port-context-menu__item"
                  role="menuitem"
                  onClick={() => {
                    onSelectBuffer(kind);
                    onClose();
                  }}
                >
                  {t(BUFFER_MENU_KEYS[kind])}
                </button>
              </li>
            ))}
          </ul>
          <div className="port-context-menu__divider" role="separator" />
        </>
      )}
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

export function bufferKindsForPort(side: 'in' | 'out'): TfgpBufferKind[] {
  if (side === 'in') return ['start_buffer', 'intermediate_buffer'];
  return ['intermediate_buffer', 'end_buffer'];
}
