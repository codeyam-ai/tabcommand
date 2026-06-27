// Formats the auto-close inactivity threshold (in minutes) for the Settings
// "Auto-close after" control. 0 is the "Off" end of the slider — the Closer
// engine treats <= 0 (and any non-positive / non-finite value) as disabled, so
// this renders "Off". Otherwise show whole minutes under an hour ("45 min"), or
// hours with one decimal only when not a whole number ("2 hr", "1.5 hr").
// Factored out of Settings.jsx so the formatting is unit-testable.
const formatAutoClose = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return 'Off';
  if (value < 60) return `${value} min`;
  const hours = value / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
};

export default formatAutoClose;
