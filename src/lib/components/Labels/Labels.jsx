import './Labels.css';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { LabelFormContainer, LabelCollection } from '..';
import { ItemTypes, ColumnsDefault } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import { effectiveColumns, COLUMN_BREAKPOINTS } from '../../utils/effectiveColumns';

const Labels = () => {
  const labelsRef = useRef();
  const [{ loading, labels, selectedLabel, chunkLength, columns }, setState] = useState({
    loading: true,
    labels: [],
    selectedLabel: null,
    chunkLength: 2,
    columns: ColumnsDefault
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

    Chrome.get('Labels1', ['labels', 'uxSettings', 'settings'], ({ labels, uxSettings, settings }) => {
      update({ newLabels: labels, newSelectedLabelTitle: (uxSettings).selectedLabel });
      // The initial fetch has resolved — clear loading even when the result is
      // empty (where `update` short-circuits as "same"), so the empty-state
      // "Add Group" guidance renders for a brand-new user.
      setPartialState({ loading: false, columns: (settings || {}).columns || ColumnsDefault });
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

        // Live-update the configured column count when the Settings control
        // writes it; the layout effect below recomputes the effective count.
        if (changes.settings) {
          setPartialState({
            columns: (changes.settings.newValue || {}).columns || ColumnsDefault
          });
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

    // Effective columns = the configured count, capped by what the current
    // viewport width can comfortably fit (see effectiveColumns). Recompute
    // whenever the viewport crosses any breakpoint or the configured `columns`
    // setting changes; the matchMedia listeners only trigger the recompute, the
    // pure util does the math from window.innerWidth.
    const recompute = () => {
      setPartialState({ chunkLength: effectiveColumns(columns, window.innerWidth) });
    };
    recompute();

    const mediaQueries = COLUMN_BREAKPOINTS.map(
      (bp) => window.matchMedia(`(min-width: ${bp.min}px)`)
    );
    for (const mediaQuery of mediaQueries) {
      mediaQuery.addEventListener("change", recompute);
    }

    return () => {
      for (const mediaQuery of mediaQueries) {
        mediaQuery.removeEventListener("change", recompute);
      }
    };
  }, [columns]);

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
    <div
      id="Labels"
      className="Labels"
      ref={labelsRef}
      style={{ '--label-columns': chunkLength }}
    >
      <div className="Labels-header">
        <span className="Labels-header-all">All Groups</span>
        <LabelFormContainer />
      </div>
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
