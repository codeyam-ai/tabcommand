import './Favorites.css';

import React, { useEffect, useState } from 'react';

import { Chrome } from '../../utils/Chrome';
import { rankFavorites } from '../../utils/rankFavorites';
import { Favicon } from '../Favicon';
import Icon from '../Icon/Icon';

// The Favorites sidebar section: the user's genuinely most-visited sites (up to
// 10 that clear the minimum-visit threshold), ordered by a frequency × recency
// blend in the pure `rankFavorites` util so the list reads as "my favorites over
// the past month" rather than all-time. A favorite currently open in a non-pinned
// tab is flagged `isOpen` and rendered with an accent-tinted background cue. It
// reads `allUrls` (recency-ordered keys) plus the corresponding `url-*` records
// from storage, stays live via `chrome.storage.onChanged`, and — like
// SearchResults — focuses an already-open tab on click or opens a new one. An
// empty install renders nothing.
const FAVORITES_LIMIT = 10;

const Favorites = () => {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    const load = () => {
      Chrome.get(
        'Favorites1',
        ['allUrls', 'activeTabs', 'favoritesHidden'],
        ({ allUrls, activeTabs, favoritesHidden }) => {
          const keys = allUrls || [];
          if (keys.length === 0) {
            setFavorites([]);
            return;
          }
          // Exclude any site currently open in a Chrome-pinned tab (already
          // always-available, so it shouldn't take a Favorites slot) and any
          // site the user explicitly removed from Favorites.
          const excludedKeys = new Set([
            ...(activeTabs || [])
              .filter((tab) => tab.pinned)
              .map((tab) => tab.urlKey),
            ...(favoritesHidden || []),
          ]);
          // Sites open in a NON-pinned tab are discounted (not excluded): their
          // in-progress visit shouldn't pad the ranking while the tab is open, so
          // Favorites doesn't just mirror the currently-open tabs.
          const openKeys = new Set(
            (activeTabs || [])
              .filter((tab) => !tab.pinned)
              .map((tab) => tab.urlKey)
          );
          Chrome.get('Favorites2', keys, (records) => {
            setFavorites(
              rankFavorites(keys, records, FAVORITES_LIMIT, excludedKeys, {
                openKeys,
              })
            );
          });
        }
      );
    };

    load();

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      // Any change to the recency list or a url-* record can shift the ranking;
      // pinning/unpinning a tab (activeTabs) or removing a favorite
      // (favoritesHidden) changes the exclusion set, so reload on those too.
      const touched = Object.keys(changes).some(
        (key) =>
          key === 'allUrls' ||
          key === 'activeTabs' ||
          key === 'favoritesHidden' ||
          key.startsWith('url-')
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

  const removeFavorite = (e, favorite) => {
    // Don't let the row's open-on-click fire when the × is clicked.
    e.stopPropagation();
    // Hide (not delete): record the urlKey in favoritesHidden so it's suppressed
    // from Favorites while staying available in Search and History.
    Chrome.get('Favorites4', 'favoritesHidden', ({ favoritesHidden }) => {
      const hidden = favoritesHidden || [];
      if (hidden.includes(favorite.urlKey)) return;
      chrome.storage.local.set({
        favoritesHidden: [...hidden, favorite.urlKey],
      });
    });
  };

  if (favorites.length === 0) return null;

  return (
    <div className="Favorites">
      <div className="Favorites-header">Favorites</div>
      {favorites.map((favorite) => (
        <div
          key={favorite.urlKey}
          className={
            'Favorites-item' +
            (favorite.isOpen ? ' Favorites-item--open' : '')
          }
          title={`${favorite.title || favorite.url}\n\n${favorite.url}`}
          onClick={(e) => openFavorite(e, favorite)}
        >
          <Favicon
            favicon={favorite.favicon}
            urlKey={favorite.urlKey}
            title={favorite.title}
          />
          <div className="Favorites-item-title">{favorite.title}</div>
          <button
            type="button"
            className="Favorites-item-remove"
            aria-label="Remove from favorites"
            title="Remove from favorites"
            onClick={(e) => removeFavorite(e, favorite)}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default Favorites;
