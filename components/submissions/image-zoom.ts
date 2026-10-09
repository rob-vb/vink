/**
 * The zoom of a Ctrl+wheel (or a trackpad pinch, which a browser sends as
 * Ctrl+wheel). One notch of a mouse wheel is about 1.16x; a pinch sends many
 * small deltas that add up smoothly. One event never changes the zoom by more
 * than MAX_WHEEL_FACTOR, whatever the device reports.
 */
const PER_PIXEL = 0.0015;
/** A line- or page-based wheel (Firefox) reports lines, not pixels: about a notch of 100 px per 3 lines. */
const PIXELS_PER_LINE = 33;
const PIXELS_PER_PAGE = 800;
export const MAX_WHEEL_FACTOR = 1.25;

export function wheelZoomFactor(deltaY: number, deltaMode: number = 0): number {
  const pixels = deltaY * (deltaMode === 1 ? PIXELS_PER_LINE : deltaMode === 2 ? PIXELS_PER_PAGE : 1);
  const factor = Math.exp(-pixels * PER_PIXEL);
  return Math.min(MAX_WHEEL_FACTOR, Math.max(1 / MAX_WHEEL_FACTOR, factor));
}
