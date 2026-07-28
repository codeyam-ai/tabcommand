import './LabelCollectionMenu.css';

import React from 'react';
import PropTypes from 'prop-types';
import { LabelForm } from '../LabelForm';
import LabelCollectionMenuActions from './LabelCollectionMenuActions';

// A group card's ⋮ menu: rename/recolor the group, then the Delete action.
//
// Positioned in VIEWPORT coordinates (`coords`) and rendered by its parent
// through a portal to document.body — the group card sets `overflow: hidden`,
// which clipped this menu at the card's bottom edge. `menuRef` is a plain prop
// (not forwardRef) so the parent can measure the rendered height and correct the
// placement before paint; see anchoredMenuCoords.
const LabelCollectionMenu = ({
  title,
  backgroundColor,
  coords = { top: 0, left: 0 },
  menuRef,
  onCancel,
  onDelete
}) => (
  <div
    ref={menuRef}
    className='LabelCollection-menu'
    style={{ top: coords.top, left: coords.left }}
    onClick={(e) => e.stopPropagation()}
  >
    <LabelForm
      onCancel={onCancel}
      label={{ title: title, backgroundColor: backgroundColor }}
    />
    <LabelCollectionMenuActions onDelete={onDelete} />
  </div>
);

LabelCollectionMenu.propTypes = {
  title: PropTypes.string,
  backgroundColor: PropTypes.string,
  coords: PropTypes.shape({ top: PropTypes.number, left: PropTypes.number }),
  menuRef: PropTypes.object,
  onCancel: PropTypes.func,
  onDelete: PropTypes.func
};

export default LabelCollectionMenu;
