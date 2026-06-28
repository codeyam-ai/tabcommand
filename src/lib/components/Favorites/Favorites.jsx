import './Favorites.css';

import React, { useEffect, useState } from 'react';

import { Chrome } from '../../utils/Chrome';
import { rankFavorites } from '../../utils/rankFavorites';
import { Favicon } from '../Favicon';

// The Favorites sidebar section: the user's most-visited sites, ranked by a
// blend of recency and visit frequency (recency-leaning) in the pure
// `rankFavorites` util. It reads `allUrls` (recency-ordered keys) plus the
// corresponding `url-*` records from storage, stays live via
// `chrome.storage.onChanged`, and — like SearchResults — focuses an already-open
// tab on click or opens a new one. An empty install renders nothing.
const FAVORITES_LIMIT = 5;

const Favorites = () => {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    const load = () => {
      Chrome.get('Favorites1', 'allUrls', ({ allUrls }) => {
        const keys = allUrls || [];
        if (keys.length === 0) {
          setFavorites([]);
          return;
        }
        Chrome.get('Favorites2', keys, (records) => {
          setFavorites(rankFavorites(keys, records, FAVORITES_LIMIT));
        });
      });
    };

    load();

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      // Any change to the recency list or to a url-* record can shift the ranking.
      const touched = Object.keys(changes).some(
        (key) => key === 'allUrls' || key.startsWith('url-')
      );
      if (touched) load();
    };
    chrome.storage.onChanged.addListener(handleChange);

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const openFavorite = (e, favorite) => {
    // Mirror SearchResults: focus the already-open tab if present, else open a
    // new one (cmd/meta-click opens in the background).
    Chrome.get('Favorites3', 'activeTabs', (result) => {
      const activeTab = (result.activeTabs || []).filter(
        (tab) => tab.urlKey === favorite.urlKey
      )[0];
      if (activeTab && !e.metaKey) {
        const tabId = parseInt(activeTab.tabKey.split('-')[1]);
        chrome.tabs.update(tabId, { active: true }, () => {});
      } else if (!activeTab) {
        chrome.tabs.create({ url: favorite.url, active: !e.metaKey }, () => {});
      }
    });
  };

  if (favorites.length === 0) return null;

  return (
    <div className="Favorites">
      <div className="Favorites-header">Favorites</div>
      {favorites.map((favorite) => (
        <div
          key={favorite.urlKey}
          className="Favorites-item"
          title={favorite.title}
          onClick={(e) => openFavorite(e, favorite)}
        >
          <Favicon
            favicon={favorite.favicon}
            urlKey={favorite.urlKey}
            title={favorite.title}
          />
          <div className="Favorites-item-title">{favorite.title}</div>
        </div>
      ))}
    </div>
  );
};

export default Favorites;
