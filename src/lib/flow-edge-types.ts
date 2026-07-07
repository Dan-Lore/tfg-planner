/** Edge label / check metadata attached to React Flow edges (presentation layer). */
export interface FlowEdgeData {
  source?: string;
  target?: string;
  checkSeverity?: 'error' | 'warning';
  checkTitle?: string;
  isCycleSeed?: boolean;
  cycleSeedTitle?: string;
  /** Set when user focuses a scheme-check issue on this edge (issues panel). */
  issuePanelFocus?: boolean;
  label?: string;
  [key: string]: unknown;
}
