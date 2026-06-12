// Formats a numeric value with locale-aware thousands separators for the Load
// page's raw per-process table (e.g. 1284 -> "1,284"). Factored out of the Load
// page so the formatting is unit-testable. Faithful to the reference: a falsy
// value (0, null, undefined, '') yields `undefined` so the caller renders
// nothing, and the locale defaults to the document language then 'en'. An
// explicit `lang` overrides both — the tests pass it for determinism.
const humanReadableNumber = (value, lang = null) => {
  if (!value) return;
  const locale = lang || (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
  const number = parseFloat(value);
  return number.toLocaleString(locale);
};

export default humanReadableNumber;
