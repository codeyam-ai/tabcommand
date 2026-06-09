import './Url.css';

import React, { useEffect, useState } from 'react';

import defaultFavicon from '../../../images/defaultFavicon.png'
import { CloseCircleOutlined, DeleteOutlined, PushpinOutlined, PushpinFilled, EditOutlined } from '@ant-design/icons';
import { Pages } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';

const Url = ({
  dragRef,
  draggableProps,
  dragHandleProps,
  expanded,
  urlKey,
  showClose,
  showActions,
  showLoad,
  closed,
  onRemove,
  encourageDrag }) => {
  if (!urlKey) return (<div></div>);

  const url = () => urlKey.replace(/^url-/, '');

  const setPartialState = (updates) => {
    if (Object.keys(updates).length === 0) return;
    setState(prevState => {
      return {
        ...prevState,
        ...updates
      }
    })
  }

  const [{ tabId, favicon, title, processStats, tabCommandPinned, hover }, setState] = useState({
    tabId: null,
    favicon: defaultFavicon,
    title: url(),
    processStats: [],
    tabCommandPinned: false,
    hover: false
  });

  let titleString = `${title || url()}\n\n${url()}`;

  const handleActiveTabs = (activeTabs) => {
    if (!activeTabs) return;
    let newTabId = null;
    let tabCommandPinned = false;
    const matching = activeTabs.filter(
      (tabUrl) => tabUrl.urlKey === urlKey
    );
    if (matching.length > 0) {
      newTabId = parseInt(matching[0].tabKey.split('-')[1]);
      tabCommandPinned = matching[0].tabCommandPinned;
    }
    return { tabId: newTabId, tabCommandPinned: tabCommandPinned };
  };

  const handleUrl = (url) => {
    if (!url) return;
    return {
      title: url.title,
      favicon: url.favicon,
      processStats: url.processes
    };
  }

  useEffect(() => {
    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;

      let updates = {};
      if (changes.activeTabs) {
        updates = handleActiveTabs(changes.activeTabs.newValue);
      }

      if (changes[urlKey]) {
        updates = {
          ...updates,
          ...handleUrl(changes[urlKey].newValue)
        };
      }
      setPartialState(updates);
    };

    chrome.storage.onChanged.addListener(handleChange);

    Chrome.get('Url1', ['activeTabs', urlKey], (result) => {
      setPartialState({
        ...handleActiveTabs(result.activeTabs || []),
        ...handleUrl(result[urlKey] || {})
      });
    });

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const handleClose = (event) => {
    event.stopPropagation();
    if (tabId) chrome.tabs.remove(tabId, () => { });
    Chrome.get('Url2', ['autoClosed', 'allUrls'], (result) => {
      const autoClosed = result.autoClosed || {};
      delete autoClosed[urlKey];

      const allUrls = result.allUrls || [];
      allUrls.splice(0, 0, allUrls.splice(allUrls.indexOf(urlKey), 1)[0]);

      Chrome.set('Url1', { autoClosed: autoClosed, allUrls: allUrls });
    });
  };

  const handleClick = (event) => {
    event.stopPropagation();
    if (tabId && !event.metaKey) {
      chrome.tabs.update(parseInt(tabId), { active: true }, () => { });
    } else if (!tabId) {
      chrome.tabs.create({
        url: url(),
        active: !event.metaKey
      }, () => { });
    }
  };

  const handleRemove = (event) => {
    if (confirm("Are you sure you want to completely remove this website?")) {
      event.stopPropagation();
      handleClose(event);
      Chrome.remove('Url1', urlKey);
      Chrome.get('Url3', 'allUrls', (result) => {
        const allUrls = result.allUrls || [];
        allUrls.splice(allUrls.indexOf(urlKey), 1);
        Chrome.set('Url2', { allUrls: allUrls });
      });
    }
  };

  const pin = (event) => {
    event.stopPropagation();
    Chrome.get('Url4', 'activeTabs', (result) => {
      const activeTabs = result.activeTabs;
      const index = activeTabs.map(t => t.urlKey).indexOf(urlKey);
      activeTabs[index].tabCommandPinned = !tabCommandPinned;
      Chrome.set('Url3', { activeTabs: activeTabs });
    });
  };

  const editUrl = (e) => {
    e.stopPropagation();
    Chrome.get('Url5', 'uxSettings', ({ uxSettings }) => {
      uxSettings.page = { name: Pages.URL, urlKey: urlKey };
      Chrome.set('Url4', { uxSettings: uxSettings });
    })
  };

  let loadClassName = 'Url-load-hidden';
  let statsLevel = 'low';
  let statsWidth = 25;
  if (processStats && (processStats.samples || 0) > 0) {
    const stats = simpleProcessStats(processStats);
    titleString += `\n\nAverage CPU: ${Math.round(stats.cpu * 10) / 10}\nAverage Private Memory: ${Math.round(stats.mem * 10) / 10}M`
    statsWidth = Math.max((stats.cpu / 72), (stats.mem / 800)) * 100;
    if (stats.cpu > 54 || stats.mem > 600) {
      statsLevel = 'excessive';
    } else if (stats.cpu > 36 || stats.mem > 400) {
      statsLevel = 'high';
    } else if (stats.cpu > 18 || stats.mem > 200) {
      statsLevel = 'medium';
    }

    loadClassName = `Url-load-${statsLevel}`;
  }

  return (
    <div
      ref={dragRef}
      {...draggableProps}
      {...dragHandleProps}
      className={`Url${encourageDrag ? ' Url-encourageDrag' : ''}${hover ? ' Url-hover' : ''}`}
      title={titleString}
      onClick={handleClick}
      onMouseEnter={() => setPartialState({ hover: true })}
      onMouseOver={() => { if (!hover) setPartialState({ hover: true }); }}
      onMouseLeave={() => setPartialState({ hover: false })}
    >
      {(showActions || hover || expanded) &&
        <div className='Url-actions'>
          {(tabId && !tabCommandPinned) &&
            <div className='Url-action Url-pin' onClick={pin} data-tool-tip="Keep Open">
              <PushpinOutlined className='Url-action-icon' />
            </div>
          }

          {(tabId && tabCommandPinned) &&
            <div className='Url-action Url-pinned' onClick={pin} data-tool-tip="Unpin">
              <PushpinFilled className='Url-action-icon' />
            </div>
          }

          <div className='Url-action Url-edit' onClick={editUrl} data-tool-tip="Edit/Annotate">
            <EditOutlined className='Url-action-icon' />
          </div>

          {closed &&
            <div className='Url-action Url-remove' onClick={handleRemove} data-tool-tip="Delete">
              <DeleteOutlined className='Url-action-icon' />
            </div>
          }
          {onRemove &&
            <div className='Url-action Url-remove' onClick={onRemove} data-tool-tip="Remove From Group">
              <DeleteOutlined className='Url-action-icon' />
            </div>
          }
          {(tabId || showClose) &&
            <div className='Url-action' onClick={handleClose} data-tool-tip="Close">
              <CloseCircleOutlined className='Url-action-icon' />
            </div>
          }
        </div>
      }

      {((showLoad && !hover) || expanded) &&
        <div className='Url-stats'>
          <div className={`${loadClassName} load-element`}>
            Load
            <div className='Url-loadIndicatorContainer'>
              <div className='Url-loadIndicator' style={{ width: statsWidth + '%' }}></div>
            </div>
          </div>
        </div>
      }

      {(tabCommandPinned && !showActions && !hover && !expanded) &&
        <PushpinFilled className='Url-tabCommandPinned' />
      }

      <div className='Url-title'>
        <img src={favicon || defaultFavicon} />
        {title || url()}
      </div>
    </div>
  );
}

export default Url;

function simpleProcessStats(processStats) {
  return {
    cpu: processStats.cpu / 100 / processStats.samples,
    mem: processStats.privateMemory / 1064000 / processStats.samples
  }
}
