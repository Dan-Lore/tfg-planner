/** Gap from the port handle to the nearest edge of the label text. */
export const FLOW_EDGE_LABEL_PORT_GAP = 4;

const FONT_STACK = 'system-ui, "Segoe UI", sans-serif';
const FONT_SIZE_REM = 0.65;
const FONT_WEIGHT = 600;

const textWidthCache = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null | undefined;

function rootFontPx(): number {
  if (typeof document === 'undefined') return 16;
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(px) && px > 0 ? px : 16;
}

function labelCanvasFont(): string {
  const size = FONT_SIZE_REM * rootFontPx();
  return `${FONT_WEIGHT} ${size}px ${FONT_STACK}`;
}

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  if (typeof document === 'undefined') {
    measureCtx = null;
    return null;
  }
  const canvas = document.createElement('canvas');
  measureCtx = canvas.getContext('2d');
  return measureCtx;
}

/** Text width in px for strings like `8000.00/s`, `6/s`, `0.0033/s`. */
export function measureFlowEdgeLabelTextWidth(text: string): number {
  const cached = textWidthCache.get(text);
  if (cached !== undefined) return cached;

  const ctx = getMeasureCtx();
  let width: number;
  if (ctx) {
    ctx.font = labelCanvasFont();
    width = ctx.measureText(text).width;
  } else {
    width = estimateFlowEdgeLabelTextWidth(text);
  }

  textWidthCache.set(text, width);
  return width;
}

/** Center-anchored label: port → center distance = gap + half text width. */
export function flowEdgeLabelCenterOffset(text: string): number {
  return FLOW_EDGE_LABEL_PORT_GAP + measureFlowEdgeLabelTextWidth(text) / 2;
}

export function flowEdgeLabelCenterOffsetFromTextWidth(textWidth: number): number {
  return FLOW_EDGE_LABEL_PORT_GAP + textWidth / 2;
}

/** Node/test fallback when canvas is unavailable. */
function estimateFlowEdgeLabelTextWidth(text: string): number {
  const size = FONT_SIZE_REM * 16;
  const avg = size * 0.58;
  return text.length * avg;
}

/** @internal test helper */
export function clearFlowEdgeLabelTextWidthCache(): void {
  textWidthCache.clear();
}
