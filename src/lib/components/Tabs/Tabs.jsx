import './Tabs.css';

import React, { useEffect, useState } from 'react';
import { Url } from '..';
import { SwitcherFilled, CaretRightFilled, CaretDownFilled } from '@ant-design/icons';

import { Droppable, Draggable } from '@hello-pangea/dnd';

import { ItemTypes, MaxAutoClosedTime } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';

const Tabs = () => {
  const setPartialState = (updates) => {
    if (Object.keys(updates).length === 0) return;
    setState(prevState => {
      return {
        ...prevState,
        ...updates
      }
    })
  }

  const [{ activeTabUrls, autoClosedUrlKeys, allUrlKeys, labelMap, archiveCollapsed }, setState] = useState({
    activeTabUrls: [],
    autoClosedUrlKeys: [],
    allUrlKeys: [],
    labelMap: {},
    archiveCollapsed: true
  });

  const ungroupedUrlKeys = () => {
    return (allUrlKeys || []).slice(0,500).filter(
      urlKey => urlKey &&
                !activeTabUrls.map(t => t.urlKey).includes(urlKey) &&
                !autoClosedUrlKeys.includes(urlKey) &&
                !labelMap[urlKey]
    ).slice(0,250);
  };

  const generateTabUrlLabels = (tabUrls) => {
    const labels = [];
    for (const tabUrl of tabUrls) {
      const labelTitle = labelMap[tabUrl.urlKey];

      if (!labelTitle) continue;

      if (labels.length === 0 ||
        labels[labels.length - 1].title !== labelTitle) {
          labels.push({
          title: labelTitle,
          tabUrls: []
        })
      }

      labels[labels.length - 1].tabUrls.push(tabUrl);
    }
    return labels;
  }

  const activeTabUrlLabels = () => {
    return generateTabUrlLabels(activeTabUrls);
  }

  const ungroupedTabUrls = () => {
    return activeTabUrls.filter(
      tabUrl => !labelMap[tabUrl.urlKey] &&
                !autoClosedUrlKeys.includes(tabUrl.urlKey)
    );
  };

  const ungroupedAutoClosed = () => {
    return autoClosedUrlKeys.filter(
      urlKey => !labelMap[urlKey]
    ).map(urlKey => ({urlKey: urlKey}));
  }

  const autoClosedTabUrlLabels = () => {
    return generateTabUrlLabels(autoClosedUrlKeys.map(urlKey => ({urlKey: urlKey})));
  }

  useEffect(() => {
    const generateLabelMap = (labels) => {
      const newLabelMap = {};
      for (const label of Object.values(labels || {})) {
        for (const urlKey of label.urlKeys) {
          newLabelMap[urlKey] = label.title;
        }
      }
      return newLabelMap;
    };

    const sortAutoClosed = (autoClosed) => {
      const autoClosedKeys = Object.keys(autoClosed || {});
      const maxTime = autoClosed.maxTime || MaxAutoClosedTime;
      return autoClosedKeys.filter(
        (urlKey) => {
          return Date.now() - autoClosed[urlKey] < maxTime
        }
      ).sort(
        (a, b) => autoClosed[a] - autoClosed[b]
      )
    };

    Chrome.get('Tabs1', ['activeTabs', 'autoClosed', 'allUrls', 'labels'], (result) => {
      const autoClosed = sortAutoClosed(result.autoClosed);
      setPartialState({
        activeTabUrls: (result.activeTabs).filter(tabUrl => !tabUrl.pinned),
        autoClosedUrlKeys: autoClosed,
        allUrlKeys: result.allUrls,
        labelMap: generateLabelMap(result.labels)
      });
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;

      const updates = {};

      if (changes.activeTabs) {
        updates.activeTabUrls = (changes.activeTabs.newValue).filter(
          tabUrl => !tabUrl.pinned
        );
      }

      if (changes.allUrls) {
        updates.allUrlKeys = changes.allUrls.newValue;
      }

      if (changes.labels) {
        const labels = changes.labels.newValue;
        updates.labelMap = generateLabelMap(labels);
      }

      if (changes.autoClosed) {
        updates.autoClosedUrlKeys = sortAutoClosed(changes.autoClosed.newValue);
      }

      setPartialState(updates);
    };

    chrome.storage.onChanged.addListener(handleChange);

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const DraggableTabUrls = ({name, urls, autoClosed}) => {
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
                {dragProvided => (
                  <Url
                    key={`${urlKey}-${tabKey}}`}
                    dragRef={dragProvided.innerRef}
                    draggableProps={dragProvided.draggableProps}
                    dragHandleProps={dragProvided.dragHandleProps}
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

  return (
    <div className={`Tabs ${archiveCollapsed ? '' : 'Tabs-archive'}`}>
      <div className="Tabs-section Tabs-active">
        <h3 className='Tabs-section-title'>Active Tabs</h3>
        <div className="Tabs-section-urls">
          { activeTabUrls.length === 0 &&
            <div className='Tabs-section-explainer'>
              Active tabs that are not pinned in your browser will display here.
              <br/><br/>
              Drag tabs from here into groups to save and organize them.
            </div>
          }

          { ungroupedTabUrls().length > 0 &&
            <div className='Tabs-section-ungrouped'>
              <h4 className='Tabs-section-labelTitle'>Ungrouped</h4>
              <DraggableTabUrls name='ungrouped' urls={ungroupedTabUrls()}/>
            </div>
          }

          {activeTabUrlLabels().map(
            (labelInfo) => (
              <div className='Tabs-section-grouped' key={`active-tabs-${labelInfo.title}`} >
                <h4 className='Tabs-section-labelTitle'>
                  {labelInfo.title}
                </h4>
                <DraggableTabUrls name={labelInfo.title} urls={labelInfo.tabUrls}/>
              </div>
            )
          )}
        </div>

      </div>
      <div className="Tabs-section Tabs-autoClosed">
        <h3 className='Tabs-section-title'>Automatically Closed</h3>
        <div className="Tabs-section-urls">
          { autoClosedUrlKeys.length === 0 &&
            <div className='Tabs-section-explainer'>
              TabCommand automatically closes tabs that have been open
              and inactive for a period of time.
              <br/><br/>
              From here for you can restore them or close them completely.
              <br/><br/>
              Mouse over any open tab above and click the thumbtack icon
              to stop it from being automatically closed.
            </div>
          }
          { ungroupedAutoClosed().length > 0 &&
            <div className='Tabs-section-ungrouped'>
              <h4 className='Tabs-section-labelTitle'>Ungrouped</h4>
              <DraggableTabUrls name='autoclosed-ungrouped' urls={ungroupedAutoClosed()} autoClosed={true} />
            </div>
          }

          {autoClosedTabUrlLabels().map(
            (labelInfo) => (
              <div className='Tabs-section-grouped' key={`active-tabs-${labelInfo.title}`} >
                <h4 className='Tabs-section-labelTitle'>
                  {labelInfo.title}
                </h4>
                <DraggableTabUrls name={`autoclosed-${labelInfo.title}`} urls={labelInfo.tabUrls} autoClosed={true}/>
              </div>
            )
          )}
        </div>
      </div>
      <div className={`Tabs-section Tabs-history Tabs-closed ${archiveCollapsed ? 'Tabs-section-collapsed' : ''}`}>
        <h3
          className='Tabs-section-title'
          onClick={() => setPartialState({ archiveCollapsed: !archiveCollapsed })}
        >
          <SwitcherFilled/>
          History
          {archiveCollapsed ? <CaretRightFilled/> : <CaretDownFilled/> }
        </h3>
        <div className="Tabs-section-urls">
          <DraggableTabUrls
            name='history'
            urls={ungroupedUrlKeys().map(urlKey => ({ urlKey: urlKey, closed: true }))}
          />
        </div>
      </div>
    </div>
  );
}

export default Tabs;
