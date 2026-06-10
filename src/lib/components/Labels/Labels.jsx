import './Labels.css';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { LabelFormContainer, LabelCollection } from '..';
import { ItemTypes } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';

const Labels = () => {
  const labelsRef = useRef();
  const [{ loading, labels, selectedLabel, chunkLength }, setState] = useState({
    loading: true,
    labels: [],
    selectedLabel: null,
    chunkLength: 3
  });

  const setPartialState = (updates) => {
    if (Object.keys(updates).length === 0) return;
    setState(prevState => {
      return {
        ...prevState,
        ...updates
      };
    });
  };

  useEffect(() => {
    let _selectedLabel = selectedLabel;
    let _labels = labels;

    const update = ({ newLabels, newSelectedLabelTitle }) => {
      const updates = {};

      // Populate labels first so a freshly-resolved (or pre-seeded) selection
      // can filter against the real label set rather than an empty array.
      if (newLabels) {
        const existingLabels = sortLabels(_labels);
        const sortedNewLabels = sortLabels(Object.values(newLabels));

        let same = sortedNewLabels.length === existingLabels.length;
        if (same) {
          for (let i = 0; i < sortedNewLabels.length; ++i) {
            if (sortedNewLabels[i].title !== existingLabels[i].title ||
                sortedNewLabels[i].backgroundColor !== existingLabels[i].backgroundColor) {
              same = false;
              break;
            }
          }
        }

        if (!same) {
          _labels = Object.values(sortedNewLabels);
          updates.loading = false;
          updates.labels = _labels;

          // Re-sync the selected label object when its underlying data changed.
          if (_selectedLabel) {
            _selectedLabel = newLabels[_selectedLabel.title];
            updates.selectedLabel = _selectedLabel;
          }
        }
      }

      if (newSelectedLabelTitle) {
        if (newSelectedLabelTitle === -1) {
          _selectedLabel = null;
          updates.selectedLabel = null;
        } else {
          _selectedLabel = _labels.filter(
            l => l.title === newSelectedLabelTitle
          )[0];
          updates.selectedLabel = _selectedLabel;
        }
      }

      if (Object.keys(updates).length > 0) {
        setPartialState(updates);
      }
    };

    Chrome.get('Labels1', ['labels', 'uxSettings'], ({ labels, uxSettings }) => {
      update({ newLabels: labels, newSelectedLabelTitle: (uxSettings).selectedLabel });
      // The initial fetch has resolved — clear loading even when the result is
      // empty (where `update` short-circuits as "same"), so the empty-state
      // "Add Group" guidance renders for a brand-new user.
      setPartialState({ loading: false });
    });

    chrome.storage.onChanged.addListener(
      (changes, areaName) => {
        if (areaName !== "local") return;

        const updates = {};

        if (changes.labels) {
          updates.newLabels = changes.labels.newValue;
        }

        if (changes.uxSettings) {
          const uxSettings = changes.uxSettings;
          if (!uxSettings.newValue) {
            updates.newSelectedLabelTitle = -1;
          } else {
            updates.newSelectedLabelTitle = uxSettings.newValue.selectedLabel;
            if (!updates.newSelectedLabelTitle) updates.newSelectedLabelTitle = -1;
          }
        }

        if (Object.keys(updates).length > 0) {
          update(updates);
        }
      }
    );
  }, []);

  useEffect(() => {
    if (selectedLabel && labelsRef.current.scrollTo) {
      labelsRef.current.scrollTo(0, 0);
    }
  }, [selectedLabel]);

  useLayoutEffect(() => {
    if (!window.matchMedia) return;

    const queries = [
      "(min-width: 1275px)",
      "(max-width: 1275px)",
      "(max-width: 950px)"
    ];
    const handleMediaChange = (e) => {
      const index = queries.indexOf(e.media);
      if (e.matches) setPartialState({ chunkLength: 3 - index });
    };

    for (const query of queries) {
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", handleMediaChange);
    }

    return () => {
      for (const query of queries) {
        const mediaQuery = window.matchMedia(query);
        mediaQuery.removeEventListener("change", handleMediaChange);
      }
    };
  });

  const sortLabels = (labelsToSort) => {
    return [...labelsToSort].sort(
      (a, b) => a.title.localeCompare(b.title)
    ).sort(
      (a, b) => (a.position || 0) - (b.position || 0)
    );
  };

  const sortedLabels = sortLabels(labels.filter((l) => {
    return l.title !== (selectedLabel ?? {}).title;
  }));

  let chunkedLabels = [];
  for (let i = 0, j = sortedLabels.length; i < j; i += chunkLength) {
    chunkedLabels.push(sortedLabels.slice(i, i + chunkLength));
  }

  return (
    <div id="Labels" className="Labels" ref={labelsRef}>
      <LabelFormContainer />
      <div className="LabelCollections">
        {(!loading && (!sortedLabels || !sortedLabels.length) && !selectedLabel) &&
          <div className='Labels-none'>
            Click the &quot;Add Group&quot; icon above to create your first group.
          </div>
        }
        {selectedLabel &&
          <div className='LabelCollections-selected'>
            <LabelCollection
              key={`labelCollection-selected-${selectedLabel.title}-${selectedLabel.backgroundColor}`}
              title={selectedLabel.title}
              draggable={false}
              index='selected'
              expanded={true}
              backgroundColor={selectedLabel.backgroundColor}
                                        // Migration - can be removed
              urlKeys={selectedLabel.urlKeys || selectedLabel.urls}
            />
          </div>
        }
        {chunkedLabels.map((labels, chunkIndex) => (
          <Droppable
            key={`LabelCollections${chunkIndex}`}
            droppableId={`LabelCollections${chunkIndex}`}
            direction="horizontal"
            type={ItemTypes.LABEL_COLLECTION}
          >
            {provided => (
              <div
                key={`LabelCollections-row${chunkIndex}`}
                ref={provided.innerRef}
                {...provided.droppableProps}
                className='LabelCollections-row'
              >
                {labels.map((label, index) => (
                  <LabelCollection
                    key={`labelCollection-${label.title}-${label.backgroundColor}`}
                    draggable={true}
                    index={(chunkLength * chunkIndex) + index}
                    title={label.title}
                    backgroundColor={label.backgroundColor}
                                              // Migration - can be removed
                    urlKeys={label.urlKeys || label.urls}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </div>
  );
};

export default Labels;
