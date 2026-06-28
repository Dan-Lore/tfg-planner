import FlowWorker from '@/workers/flow-worker?worker';
import type {
  FlowComputeMode,
  FlowWorkerRequest,
  FlowWorkerResponse,
} from '@/workers/flow-worker';

let worker: Worker | null = null;
let nextId = 0;
let latestId = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new FlowWorker();
  }
  return worker;
}

export function computeFlowsAsync(
  request: Omit<FlowWorkerRequest, 'id'>,
): Promise<FlowWorkerResponse | null> {
  const id = ++nextId;
  latestId = id;

  return new Promise((resolve) => {
    const w = getWorker();
    const onMessage = (event: MessageEvent<FlowWorkerResponse>) => {
      if (event.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (id !== latestId) {
        resolve(null);
        return;
      }
      resolve(event.data);
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ ...request, id } satisfies FlowWorkerRequest);
  });
}

export function isLatestFlowRequest(id: number): boolean {
  return id === latestId;
}

export function terminateFlowWorker(): void {
  worker?.terminate();
  worker = null;
}

export type { FlowComputeMode, FlowWorkerResponse };
