/** Edge label / check metadata attached to React Flow edges (presentation layer). */
export interface FlowEdgeData {
  source?: string;
  target?: string;
  checkSeverity?: 'error' | 'warning';
  checkTitle?: string;
  label?: string;
  [key: string]: unknown;
}
