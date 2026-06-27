import './LabelForm.css';

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Colors } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import { Icon } from '../Icon';

const LabelForm = ({ label, onCancel }) => {
  const [title, setName] = useState((label || {}).title);
  const [color, setColor] = useState((label || {}).backgroundColor);

  const onNameChange = (event) => setName(event.target.value);

  // Preview hue shown in the dot + custom swatch: the chosen color, falling back
  // to the same length-based auto-pick onSubmit uses when nothing is selected.
  const previewColor = color || Colors[(title || '').length % Colors.length];
  const isCustom = !!color && !Colors.includes(color);

  const onSubmit = (e) => {
    e.stopPropagation();
    e.preventDefault();

    Chrome.get('LabelForm1', 'labels', (result) => {
      const labels = result.labels || {};
      const existingTitle = (label || {}).title;

      const updatedLabel = labels[existingTitle] || {};
      updatedLabel.title = title;
      updatedLabel.backgroundColor = color || Colors[title.length % Colors.length];
      if (!updatedLabel.position) updatedLabel.position = Object.keys(labels).length * -1;
      if (!updatedLabel.urlKeys) updatedLabel.urlKeys = [];

      if (existingTitle && labels[existingTitle]) {
        delete labels[existingTitle];
      }

      labels[title] = updatedLabel;
      Chrome.set('LabelForm1', { labels: labels });
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

        <label
          className={`LabelForm-custom ${isCustom ? 'selected' : ''}`}
          title='Custom color'
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type='color'
            className='LabelForm-customInput'
            aria-label='Custom color'
            value={isCustom ? color : previewColor}
            onChange={(event) => {
              event.stopPropagation();
              setColor(event.target.value);
            }}
          />
        </label>
      </div>

      <div className='LabelForm-actions'>
        <button type='button' className='LabelForm-cancel' onClick={onCancel}>Cancel</button>
        <button type='submit' className='LabelForm-create'>Create group</button>
      </div>
    </form>
  );
};

LabelForm.propTypes = {
  label: PropTypes.object,
  onCancel: PropTypes.func
};

export default LabelForm;
