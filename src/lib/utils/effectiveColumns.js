import { ColumnsDefault } from '../../Constants';

// Viewport widths (px) at which the center pane can comfortably fit N group
// columns. Thresholds account for the fixed left/right sidebars eating into the
// viewport, so the user's chosen count renders fully at the standard desktop
// width (~1440px) and only steps down as the window genuinely narrows. Ordered
// widest-first so the first match wins.
export const COLUMN_BREAKPOINTS = [
  { min: 1240, columns: 4 },
  { min: 1000, columns: 3 },
  { min: 760, columns: 2 },
];

// The most columns the given viewport width can comfortably fit, never fewer
// than 1 (below the narrowest breakpoint the grid collapses to a single column).
export function columnsForWidth(viewportWidth) {
  for (const bp of COLUMN_BREAKPOINTS) {
    if (viewportWidth >= bp.min) return bp.columns;
  }
  return 1;
}

// The effective column count to render: the user's configured count, capped by
// what the current viewport width can fit. A non-positive or non-numeric
// configured value falls back to ColumnsDefault so the grid still renders.
export function effectiveColumns(configuredColumns, viewportWidth) {
  const fits = columnsForWidth(viewportWidth);
  const configured = Number(configuredColumns);
  const safe = Number.isFinite(configured) && configured >= 1 ? configured : ColumnsDefault;
  return Math.min(safe, fits);
}

export default effectiveColumns;
