// Maps an overall browser-load percentage onto the three triage/gauge severity
// bands, given the user's `warnAt` threshold (the % at which the gauge + triage
// turn red). The medium ("getting busy") band begins at `warnAt * 0.6`; below
// that is "comfortable". Shared by the LoadMeter gauge and the Triage panel so
// both color the same load the same way. This is distinct from
// `summarizeProcessLoad`'s PER-TAB level — this is the WHOLE-browser band.
export function loadLevel(load, warnAt) {
  if (load >= warnAt) return 'high';
  if (load >= warnAt * 0.6) return 'medium';
  return 'low';
}

export default loadLevel;
