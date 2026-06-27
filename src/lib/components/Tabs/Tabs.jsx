import './Tabs.css';

import React, { useEffect, useState } from 'react';
import { Url } from '..';
import { Icon } from '../Icon';

import { Droppable, Draggable } from '@hello-pangea/dnd';

import { ItemTypes, MaxAutoClosedTime, Pages, HeavyThresholdDefault } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import { summarizeProcessLoad } from '../../utils/processLoad';
import humanReadableNumber from '../../utils/humanReadableNumber';

// Fixed load cutoffs for the heaviest-tabs bar color, matching the gauge legend:
// < 40 light, 40–69 medium, ≥ 70 high. Independent of `heavyThreshold` (which
// only decides which tabs enter the list).
const loadColor = (width) =>
  width >= 70 ? 'var(--c-load-high)' : width >= 40 ? 'var(--c-load-med)' : 'var(--c-load-light)';

const Tabs = ({ reviewMode = false }) => {
  const setPartialState = (updates) => {
    if (Object.keys(updates).length === 0) return;
    setState(prevState => {
      return {
        ...prevState,
        ...updates
      }
    })
  }

  const [{ activeTabUrls, autoClosedUrlKeys, labelMap, colorMap, urlDataMap, settings }, setState] = useState({
    activeTabUrls: [],
    autoClosedUrlKeys: [],
    labelMap: {},
    colorMap: {},
    urlDataMap: {},
    settings: { heavyThreshold: HeavyThresholdDefault }
  });

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

  // Tabs whose per-tab load ≥ heavyThreshold, heaviest first. Shares the
  // summarize math + threshold with the sidebar Triage card and the Load page.
  const heaviestTabs = () => {
    const heavyThreshold = (settings && settings.heavyThreshold) ?? HeavyThresholdDefault;
    return activeTabUrls
      .map((tabUrl) => {
        const url = urlDataMap[tabUrl.urlKey];
        const load = url && url.processes ? summarizeProcessLoad(url.processes) : null;
        return { tabUrl, url, load };
      })
      .filter((item) => item.load && item.load.width >= heavyThreshold)
      .sort((a, b) => b.load.width - a.load.width);
  };

  useEffect(() => {
    const generateLabelMap = (labels) => {
      const newLabelMap = {};
      for (const label of Object.values(labels || {})) {
        for (const urlKey of label.urlKeys || label.urls || []) {
          newLabelMap[urlKey] = label.title;
        }
      }
      return newLabelMap;
    };

    // urlKey -> owning group's color, so each heaviest-tab row gets its group dot.
    const generateColorMap = (labels) => {
      const newColorMap = {};
      for (const label of Object.values(labels || {})) {
        for (const urlKey of label.urlKeys || label.urls || []) {
          newColorMap[urlKey] = label.backgroundColor;
        }
      }
      return newColorMap;
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

    // Reads `settings` + the per-URL process records for the current active tabs,
    // so the Heaviest-Tabs section can size its bars. Mirrors how Triage feeds
    // its heavy count.
    const readLoad = () => {
      Chrome.get('Tabs2', ['settings', 'activeTabs'], (base) => {
        const newSettings = base.settings || {};
        const activeTabs = (base.activeTabs || []).filter((t) => !t.pinned);
        const urlKeys = activeTabs.map((t) => t.urlKey);
        if (!urlKeys.length) {
          setPartialState({ settings: newSettings, urlDataMap: {} });
          return;
        }
        Chrome.get('Tabs3', urlKeys, (urls) => {
          setPartialState({ settings: newSettings, urlDataMap: urls });
        });
      });
    };

    Chrome.get('Tabs1', ['activeTabs', 'autoClosed', 'labels'], (result) => {
      const autoClosed = sortAutoClosed(result.autoClosed);
      setPartialState({
        activeTabUrls: (result.activeTabs).filter(tabUrl => !tabUrl.pinned),
        autoClosedUrlKeys: autoClosed,
        labelMap: generateLabelMap(result.labels),
        colorMap: generateColorMap(result.labels)
      });
    });
    readLoad();

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;

      const updates = {};

      if (changes.activeTabs) {
        updates.activeTabUrls = (changes.activeTabs.newValue).filter(
          tabUrl => !tabUrl.pinned
        );
      }

      if (changes.labels) {
        const labels = changes.labels.newValue;
        updates.labelMap = generateLabelMap(labels);
        updates.colorMap = generateColorMap(labels);
      }

      if (changes.autoClosed) {
        updates.autoClosedUrlKeys = sortAutoClosed(changes.autoClosed.newValue);
      }

      setPartialState(updates);

      // Refresh the heaviest-tabs feed when its inputs move: the tab set, the
      // threshold, or any per-URL process record (`url-*`).
      if (
        changes.activeTabs ||
        changes.settings ||
        Object.keys(changes).some((key) => key.startsWith('url-'))
      ) {
        readLoad();
      }
    };

    chrome.storage.onChanged.addListener(handleChange);

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  // Closes a heaviest-tab the same way Url's ✕ does: kill the live Chrome tab
  // (the background then drops it from activeTabs) and tidy autoClosed / allUrls.
  const closeHeavyTab = (tabUrl) => (event) => {
    event.stopPropagation();
    const tabId = tabUrl.tabKey && parseInt(tabUrl.tabKey.split('-')[1]);
    if (tabId) chrome.tabs.remove(tabId, () => {});
    Chrome.get('Tabs4', ['autoClosed', 'allUrls'], (result) => {
      const autoClosed = result.autoClosed || {};
      delete autoClosed[tabUrl.urlKey];

      const allUrls = result.allUrls || [];
      const index = allUrls.indexOf(tabUrl.urlKey);
      if (index > -1) allUrls.splice(0, 0, allUrls.splice(index, 1)[0]);

      Chrome.set('Tabs1', { autoClosed: autoClosed, allUrls: allUrls });
    });
  };

  const goToHistory = () => {
    Chrome.get('Tabs5', 'uxSettings', ({ uxSettings }) => {
      uxSettings.page = { name: Pages.HISTORY };
      Chrome.set('Tabs2', { uxSettings: uxSettings });
    });
  };

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

  const heavyRows = heaviestTabs();

  return (
    <div className="Tabs">
      { heavyRows.length > 0 &&
        <div className={`Tabs-section Tabs-heaviest${reviewMode ? ' Tabs-heaviest-review' : ''}`}>
          <h3 className='Tabs-section-title'>Heaviest Tabs</h3>
          <div className="Tabs-heaviest-rows">
            {heavyRows.map(({ tabUrl, url, load }) => {
              const title = (url && url.title) || tabUrl.urlKey.replace(/^url-/, '');
              const barWidth = Math.min(load.width, 100);
              const mem = humanReadableNumber(Math.round(load.mem)) || '0';
              return (
                <div className="Tabs-heavyRow" key={`heavy-${tabUrl.urlKey}`}>
                  <span
                    className="Tabs-heavyRow-dot"
                    style={{ background: colorMap[tabUrl.urlKey] || 'var(--text-muted)' }}
                  />
                  <span className="Tabs-heavyRow-title" title={title}>{title}</span>
                  <span className="Tabs-heavyRow-bar">
                    <span
                      className="Tabs-heavyRow-barFill"
                      style={{ width: `${barWidth}%`, background: loadColor(load.width) }}
                    />
                  </span>
                  <span className="Tabs-heavyRow-stats">
                    {Math.round(load.width)}% · ≈{mem} MB
                  </span>
                  <button
                    className="Tabs-heavyRow-close"
                    onClick={closeHeavyTab(tabUrl)}
                    title="Close tab"
                    aria-label="Close tab"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      }

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
      <div className="Tabs-footer">
        <button className="Tabs-historyBtn" onClick={goToHistory}>
          <Icon name="history" size={15} />
          History
        </button>
      </div>
    </div>
  );
}

export default Tabs;
