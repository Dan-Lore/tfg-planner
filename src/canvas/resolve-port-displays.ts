import type { PortDisplay } from '@/canvas/MachineNode';

/** Render a handle for every port id; prefer display metadata when present. */
export function resolvePortDisplays(
  portIds: string[] | undefined,
  displayPorts: PortDisplay[],
  fallbackPorts: PortDisplay[] | undefined,
): PortDisplay[] {
  const byId = new Map<string, PortDisplay>();
  for (const port of fallbackPorts ?? []) byId.set(port.portId, port);
  for (const port of displayPorts) byId.set(port.portId, port);

  const ids =
    portIds && portIds.length > 0
      ? portIds
      : [...byId.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return ids.map(
    (portId) =>
      byId.get(portId) ?? {
        portId,
        label: '',
        connected: false,
      },
  );
}
