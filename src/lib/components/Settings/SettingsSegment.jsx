import React from 'react';
import PropTypes from 'prop-types';

// A compact segmented button-group used inside the Settings popover (the Theme
// Day/Night/System control and the Group-columns 2/3/4 control). Presentational
// only: renders one button per option, marks the active one, and calls
// `onChange(value)` on click. The current value + handler are owned by the
// parent. Pass `full` for the full-width variant whose segments stretch evenly
// across the panel (the Theme control); omit it for the inline digit picker.
const SettingsSegment = ({ options, value, onChange, ariaLabel, full = false }) => (
  <div
    className={`Settings-segment${full ? ' Settings-segment-full' : ''}`}
    role="group"
    aria-label={ariaLabel}
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={value === option.value ? 'is-active' : ''}
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

SettingsSegment.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.node.isRequired,
    })
  ).isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string,
  full: PropTypes.bool,
};

export default SettingsSegment;
