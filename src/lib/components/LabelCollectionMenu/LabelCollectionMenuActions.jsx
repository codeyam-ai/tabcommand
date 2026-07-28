import React from 'react';
import PropTypes from 'prop-types';
import { Icon } from '../Icon';

// The action list at the foot of a group's menu. Group sharing hasn't shipped,
// so it is hidden entirely rather than announced as a disabled row — the menu
// only offers actions that actually do something. Restore the entry when
// sharing works.
const LabelCollectionMenuActions = ({ onDelete }) => (
  <div className='LabelCollection-menu-section LabelCollection-menu-actions'>
    <button className='LabelCollection-delete' onClick={onDelete}>
      <Icon name="close" size={15} /> Delete Group
    </button>
  </div>
);

LabelCollectionMenuActions.propTypes = {
  onDelete: PropTypes.func
};

export default LabelCollectionMenuActions;
