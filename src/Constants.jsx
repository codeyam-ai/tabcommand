export const Pages = {
  HOME: 'Home',
  IMPORTEXPORT: 'ImportExport',
  URL: 'Url',
  LOAD: 'Load',
  HISTORY: 'History'
}

export const ItemTypes = {
  URL: 'Url',
  LABEL_COLLECTION: 'LabelCollection'
}

// The nine functional group hues, mirroring Chrome's tab-group colors. No two
// groups repeat a hue. Kept constant across light/dark for wayfinding.
export const Colors = [
  '#1e9e57', // green
  '#2f7de1', // blue
  '#e07d1e', // orange
  '#c2278a', // pink
  '#d8352a', // red
  '#168f8f', // teal
  '#7c3aed', // purple
  '#5b6470', // gray
  '#cf9f1c', // gold
];

export const AutoCloseMinutes = 120;
export const MaxAutoClosedTime = 1000 * 60 * 60 * 24 * 5;

// Load-gauge / triage tunables (persisted under the `settings` storage key).
// warnAt: overall load % at which the gauge + triage turn red.
// heavyThreshold: per-tab load % at/above which a tab counts as "heavy".
export const WarnAtDefault = 70;
export const HeavyThresholdDefault = 60;

// How many columns of group cards (LabelCollection) the center area shows at
// comfortable width. Persisted under the `settings` key; user-selectable as
// 2 / 3 / 4. Default 2 preserves the original layout.
export const ColumnsDefault = 2;
