import './Url.css';

import React, { useEffect, useState } from 'react';

import { Icon } from '../Icon';
import { Pages } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import { summarizeProcessLoad } from '../../utils/processLoad';
import Favicon from '../Favicon/Favicon';

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
  showUrl,
  encourageDrag,
  dragging }) => {
  if (!urlKey) return (<div></div>);

  const url = () => urlKey.replace(/^url-/, '');

  // Compact, human-readable form of the URL (host + path, no protocol/query) used
  // as a subtitle to tell apart sibling tabs that share an identical title.
  const displayUrl = () => {
    const raw = url();
    try {
      const u = new URL(raw);
      const path = u.pathname === '/' ? '' : u.pathname;
      return u.hostname.replace(/^www\./, '') + path;
    } catch {
      return raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  };

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
    favicon: '',
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

  // The far-right ✕ removes the row from wherever it lives: out of its group
  // (onRemove), out of history (handleRemove for a closed url), or it closes the
  // live tab (handleClose). Always visible, unlike the hover-only pin/edit row.
  const removeHandler = onRemove || (closed ? handleRemove : handleClose);
  const showRemove = !!(onRemove || closed || tabId || showClose);

  let loadClassName = 'Url-load-hidden';
  let statsWidth = 25;
  const load = summarizeProcessLoad(processStats);
  if (load) {
    titleString += `\n\nAverage CPU: ${Math.round(load.cpu * 10) / 10}\nAverage Private Memory: ${Math.round(load.mem * 10) / 10}M`
    statsWidth = load.width;
    loadClassName = `Url-load-${load.level}`;
  }

  return (
    <div
      ref={dragRef}
      {...draggableProps}
      {...dragHandleProps}
      className={`Url${encourageDrag ? ' Url-encourageDrag' : ''}${hover ? ' Url-hover' : ''}${dragging ? ' Url-dragging' : ''}`}
      title={titleString}
      onClick={handleClick}
      onMouseEnter={() => setPartialState({ hover: true })}
      onMouseOver={() => { if (!hover) setPartialState({ hover: true }); }}
      onMouseLeave={() => setPartialState({ hover: false })}
    >
      {showRemove && !dragging &&
        <div
          className='Url-removeBtn'
          onClick={removeHandler}
          data-tool-tip="Remove"
          title="Remove"
        >
          <Icon name="close" size={14} className='Url-action-icon' />
        </div>
      }

      {(showActions || hover || expanded) && !dragging &&
        <div className='Url-actions'>
          {(tabId && !tabCommandPinned) &&
            <div className='Url-action Url-pin' onClick={pin} data-tool-tip="Keep Open">
              <Icon name="pin" size={15} className='Url-action-icon' />
            </div>
          }

          {(tabId && tabCommandPinned) &&
            <div className='Url-action Url-pinned' onClick={pin} data-tool-tip="Unpin">
              <Icon name="pin" size={15} className='Url-action-icon' />
            </div>
          }

          <div className='Url-action Url-edit' onClick={editUrl} data-tool-tip="Edit/Annotate">
            <Icon name="edit" size={15} className='Url-action-icon' />
          </div>
        </div>
      }

      {((showLoad && !hover) || expanded) && !dragging &&
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
        <Icon name="pin" size={15} className='Url-tabCommandPinned' />
      }

      <div className='Url-title'>
        <Favicon favicon={favicon} urlKey={urlKey} title={title} />
        {title || url()}
      </div>

      {showUrl &&
        <div className='Url-subtitle' title={url()}>{displayUrl()}</div>
      }
    </div>
  );
}

export default Url;
