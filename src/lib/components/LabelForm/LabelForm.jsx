import './LabelForm.css';

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Colors } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';

const LabelForm = ({ label, onCancel }) => {
  const [title, setName] = useState((label || {}).title);
  const [color, setColor] = useState((label || {}).backgroundColor);

  const onNameChange = (event) => setName(event.target.value);

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
      <input
        autoFocus
        value={title}
        placeholder="Group Title"
        onChange={onNameChange}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
      />
      <div className='LabelForm-colors'>
        {Colors.map(
          (c) => (
            <div
              key={c}
              className={`LabelForm-color LabelForm-${c} ${color === c && 'selected'}`}
              style={{ backgroundColor: c }}
              onClick={(event) => {
                event.stopPropagation();
                setColor(c);
              }}
            ></div>
          )
        )}
      </div>
      <div>
        <h3 className='LabelForm-cancelLink' onClick={onCancel}>Cancel</h3>
        <button>Save</button>
      </div>
    </form>
  );
};

LabelForm.propTypes = {
  label: PropTypes.object,
  onCancel: PropTypes.func
};

export default LabelForm;
