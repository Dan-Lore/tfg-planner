/** Product edge shared by `.tfgp` schema and flow solver — ports are always required. */
export interface SchemeGraphEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  itemId?: string;
  fluidId?: string;
}
