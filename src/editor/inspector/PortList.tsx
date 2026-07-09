import { loadGradientStyle } from '@/lib/load-gradient';
import type { PortDisplay } from '@/canvas/MachineNode';
import { formatLoadPercentDisplay } from '@/editor/inspector/inspector-shared';

export function PortList({
  ports,
  direction,
  t,
}: {
  ports: PortDisplay[];
  direction: 'in' | 'out';
  t: (key: string) => string;
}) {
  if (ports.length === 0) return null;
  return (
    <ul className="editor-inspector__port-list">
      {ports.map((port) => (
        <li key={port.portId} className="editor-inspector__port-row">
          <span className="editor-inspector__port-label" title={port.tooltip ?? port.label}>
            {port.label}
          </span>
          <span className="editor-inspector__port-meta">
            {port.rate && <span className="editor-inspector__port-rate">{port.rate}</span>}
            {(port.loadLabel != null || (direction === 'out' && port.loadPercent != null)) && (
              <span
                className="editor-inspector__port-load"
                style={loadGradientStyle(port.loadPercent ?? 0)}
                title={port.tooltip}
              >
                {formatLoadPercentDisplay(port.loadPercent ?? 0)}
              </span>
            )}
            {!port.connected && (
              <span className="editor-inspector__port-open">{t('editor.inspector.portOpen')}</span>
            )}
          </span>
          <span className="editor-inspector__port-id">
            {direction === 'in' ? t('editor.inspector.portIn') : t('editor.inspector.portOut')}{' '}
            {port.portId}
          </span>
        </li>
      ))}
    </ul>
  );
}
