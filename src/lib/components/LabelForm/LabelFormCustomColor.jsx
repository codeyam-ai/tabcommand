import React from 'react';
import PropTypes from 'prop-types';

// The custom-color pill, rendered as the last item of the preset swatch grid so
// it fills the gap at the end of the final swatch row. A <label> rather than a
// <button> because it wraps the native <input type=color> — that wrapping is
// what makes a click anywhere in the pill open the OS picker, so the input does
// not need to stretch to be the hit target. The visible text carries the "opens
// a picker" signal, freeing the swatch to preview the currently chosen color.
const LabelFormCustomColor = ({ previewColor, color, isCustom, onSelect }) => (
  <label
    className={`LabelForm-custom ${isCustom ? 'selected' : ''}`}
    onClick={(event) => event.stopPropagation()}
  >
    <span
      className='LabelForm-customSwatch'
      style={{ backgroundColor: previewColor }}
      aria-hidden='true'
    ></span>
    <span className='LabelForm-customText'>Custom</span>
    <input
      type='color'
      className='LabelForm-customInput'
      aria-label='Custom color'
      value={isCustom ? color : previewColor}
      onChange={(event) => {
        event.stopPropagation();
        onSelect(event.target.value);
      }}
    />
  </label>
);

LabelFormCustomColor.propTypes = {
  previewColor: PropTypes.string,
  color: PropTypes.string,
  isCustom: PropTypes.bool,
  onSelect: PropTypes.func
};

export default LabelFormCustomColor;
