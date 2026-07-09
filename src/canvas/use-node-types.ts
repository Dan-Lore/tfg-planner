import { useMemo } from 'react';
import { BufferNode } from '@/canvas/BufferNode';
import { CustomMachineNode } from '@/canvas/CustomMachineNode';
import { MachineNode } from '@/canvas/MachineNode';

export function useNodeTypes() {
  return useMemo(
    () => ({ machine: MachineNode, buffer: BufferNode, customMachine: CustomMachineNode }),
    [],
  );
}
