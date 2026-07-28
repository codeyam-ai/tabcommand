import React from 'react';
import PropTypes from 'prop-types';
import { Icon } from '../Icon';

// The action list at the foot of a group's menu. Share is a placeholder for a
// feature that hasn't shipped, so it renders disabled with an explanatory title
// rather than being hidden — the affordance is the announcement.
const LabelCollectionMenuActions = ({ onDelete }) => (
  <div className='LabelCollection-menu-section LabelCollection-menu-actions'>
    <button className='LabelCollection-share' disabled title='Group sharing is coming soon'>
      <Icon name="globe" size={15} /> Share Group
    </button>
    <button className='LabelCollection-delete' onClick={onDelete}>
      <Icon name="close" size={15} /> Delete Group
    </button>
  </div>
);

LabelCollectionMenuActions.propTypes = {
  onDelete: PropTypes.func
};

export default LabelCollectionMenuActions;
