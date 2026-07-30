import './LabelForm.css';

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Colors } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import { Icon } from '../Icon';
import LabelFormCustomColor from './LabelFormCustomColor';

const LabelForm = ({ label, onCancel, onPreview, onSaved }) => {
  // Default to '' rather than undefined: an undefined `value` makes the input
  // uncontrolled until the first keystroke (React warns on the switch), and
  // onSubmit's `title.length` would throw on a create-mode submit with no typing.
  const [title, setName] = useState((label || {}).title || '');
  const [color, setColor] = useState((label || {}).backgroundColor);

  const onNameChange = (event) => setName(event.target.value);

  // Preview hue shown in the dot + custom swatch: the chosen color, falling back
  // to the same length-based auto-pick onSubmit uses when nothing is selected.
  const previewColor = color || Colors[(title || '').length % Colors.length];
  const isCustom = !!color && !Colors.includes(color);

  // Report the pending appearance to whoever hosts this form so a group card can
  // show it before Save. Keyed on the DERIVED previewColor rather than on each
  // control's onClick, so the preset buttons, the custom-color input, and the
  // length-based auto-pick all feed the preview through this one path. Firing on
  // mount is intentional: the initial values equal the card's committed ones, so
  // the first report is a visual no-op.
  useEffect(() => {
    if (onPreview) onPreview({ title: title, backgroundColor: previewColor });
  }, [title, previewColor]);

  const onSubmit = (e) => {
    e.stopPropagation();
    e.preventDefault();

    Chrome.get('LabelForm1', 'labels', (result) => {
      const labels = result.labels || {};
      const existingTitle = (label || {}).title;

      const committedColor = color || Colors[title.length % Colors.length];

      const updatedLabel = labels[existingTitle] || {};
      updatedLabel.title = title;
      updatedLabel.backgroundColor = committedColor;
      if (!updatedLabel.position) updatedLabel.position = Object.keys(labels).length * -1;
      if (!updatedLabel.urlKeys) updatedLabel.urlKeys = [];

      if (existingTitle && labels[existingTitle]) {
        delete labels[existingTitle];
      }

      labels[title] = updatedLabel;
      Chrome.set('LabelForm1', { labels: labels });

      // Hand the committed values to the host so it can promote them as it drops
      // the preview. Without this the card would repaint the OLD color for the
      // frames between this write and the storage-change re-render — a visible
      // flash of exactly the color the user just replaced.
      if (onSaved) onSaved({ title: title, backgroundColor: committedColor });
    });

    if (onCancel) onCancel();
  };

  return (
    <form className='LabelForm' onSubmit={onSubmit}>
      <div className='LabelForm-header'>{label ? 'Edit group' : 'New group'}</div>

      <div className='LabelForm-nameField'>
        <span
          className='LabelForm-dot'
          style={{ backgroundColor: previewColor }}
          aria-hidden='true'
        ></span>
        <input
          className='LabelForm-nameInput'
          autoFocus
          value={title}
          placeholder="Group Title"
          onChange={onNameChange}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        />
      </div>

      <div className='LabelForm-pick'>Pick a color</div>

      <div className='LabelForm-colors'>
        {Colors.map(
          (c) => (
            <button
              type='button'
              key={c}
              aria-label={`Use color ${c}`}
              className={`LabelForm-color LabelForm-${c} ${color === c ? 'selected' : ''}`}
              style={{ backgroundColor: c }}
              onClick={(event) => {
                event.stopPropagation();
                setColor(c);
              }}
            >
              {color === c && <Icon name='check' size={12} className='LabelForm-colorCheck' />}
            </button>
          )
        )}

        <LabelFormCustomColor
          previewColor={previewColor}
          color={color}
          isCustom={isCustom}
          onSelect={setColor}
        />
      </div>

      <div className='LabelForm-actions'>
        <button type='button' className='LabelForm-cancel' onClick={onCancel}>Cancel</button>
        <button type='submit' className='LabelForm-create'>{label ? 'Save' : 'Create group'}</button>
      </div>
    </form>
  );
};

LabelForm.propTypes = {
  label: PropTypes.object,
  onCancel: PropTypes.func,
  onPreview: PropTypes.func,
  onSaved: PropTypes.func
};

export default LabelForm;
