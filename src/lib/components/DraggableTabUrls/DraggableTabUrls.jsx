import React from 'react';
import PropTypes from 'prop-types';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Url } from '..';

import { ItemTypes } from '../../../Constants';

// One draggable section of the sidebar's tab rail: a Droppable wrapping a
// Draggable row per url.
//
// It lives in its own module rather than inside Tabs' body, and that placement
// is load-bearing rather than cosmetic. Declared inside Tabs, this was a NEW
// component type on every Tabs render, so React tore down and rebuilt the whole
// Droppable/Draggable subtree instead of reconciling it — and a remount of the
// row being dragged makes @hello-pangea/dnd cancel the drag, stranding the row
// mid-flight. A stable module-level type is what lets React reconcile.
//
// It closes over nothing from Tabs; everything it needs arrives as props.
const DraggableTabUrls = ({ name, urls, autoClosed }) => {
  return (
    <Droppable
      key={`Tabs-urls-${name}`}
      droppableId={`Tabs-urls-${name}`}
      isDropDisabled={true}
      direction="vertical"
      type={ItemTypes.URL}
    >
      {provided => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`Tabs-urls-${name}`}
        >
          {urls.map(({urlKey, tabKey, closed}, urlIndex) => (
            <Draggable
              key={`Tabs-urls-${name}-${urlKey}`}
              id={`Tabs-urls-${name}-${urlKey}`}
              draggableId={`Tabs-urls-${name}-${urlKey}`}
              index={urlIndex}
            >
              {(dragProvided, dragSnapshot) => (
                <Url
                  key={`${urlKey}-${tabKey}}`}
                  dragRef={dragProvided.innerRef}
                  draggableProps={dragProvided.draggableProps}
                  dragHandleProps={dragProvided.dragHandleProps}
                  dragging={dragSnapshot.isDragging}
                  tabId={tabKey && parseInt(tabKey.split('-')[1])}
                  urlKey={urlKey}
                  closed={closed}
                  showLoad={!closed && !autoClosed}
                  showActions={false}
                  showClose={autoClosed}
                  encourageDrag={name.indexOf('ungrouped') > -1}
                />
              )}
            </Draggable>
          ))}
          { provided.placeholder }
        </div>
      )}
    </Droppable>
  );
}

DraggableTabUrls.propTypes = {
  name: PropTypes.string,
  urls: PropTypes.array,
  autoClosed: PropTypes.bool
};

export default DraggableTabUrls;
