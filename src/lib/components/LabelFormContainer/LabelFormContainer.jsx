import './LabelFormContainer.css';

import React, { useState } from 'react';
import PropTypes from 'prop-types';

import { LabelForm } from '..';

const LabelFormContainer = ({ expand }) => {
  const [expanded, setExpanded] = useState(expand || false);

  const onExpandClick = () => {
    setExpanded(!expanded);
  };

  return (
    <div>
      <div className='LabelFormContainer' onClick={expanded ? null : onExpandClick}>
        <h3 className='LabelFormContainer-addGroup-button'>+</h3>
        <h3 className="LabelFormContainer-addGroup">Add Group</h3>
        {expanded &&
          <div className='LabelFormContainer-wrapper'>
            <LabelForm onCancel={onExpandClick} />
          </div>
        }
      </div>
      {expanded && <div id="BackgroundOverlay" onClick={onExpandClick}></div>}
    </div>
  );
};

LabelFormContainer.propTypes = {
  expand: PropTypes.bool
};

export default LabelFormContainer;
