import './ViewAllFavorites.css';

import React, { useEffect, useState } from 'react';

import { Chrome } from '../../utils/Chrome';
import { rankFavorites } from '../../utils/rankFavorites';
import { usageMax } from '../../utils/usageMax';
import { Pages } from '../../../Constants';
import { Icon, FavoriteRow } from '../../components';

const back = () => {
  Chrome.get('ViewAllFavorites0', 'uxSettings', ({ uxSettings }) => {
    uxSettings.page = { name: Pages.HOME };
    Chrome.set('ViewAllFavorites1', { uxSettings });
  });
};

// View All Favorites: a full page listing EVERY qualifying favorite (uncapped),
// each with the stats that explain its rank — visit count in the window,
// last-visited, the computed decay score, and a usage-over-time sparkline. Sites
// the user removed from Favorites are shown here too, dimmed, with a "Bring back"
// action (the inverse of the sidebar's remove), so the page is where hidden
// favorites can be recovered. Mirrors the History page: reads storage in an
// effect, stays live via chrome.storage.onChanged, and focuses an already-open
// tab on click (or opens a new one). Each row is a FavoriteRow component.
const ViewAllFavorites = () => {
  const [favorites, setFavorites] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const load = () => {
      const at = Date.now();
      setNow(at);
      Chrome.get(
        'ViewAllFavorites2',
        ['allUrls', 'activeTabs', 'favoritesHidden'],
        ({ allUrls, activeTabs, favoritesHidden }) => {
          const keys = allUrls || [];
          if (keys.length === 0) {
            setFavorites([]);
            return;
          }
          // Only Chrome-pinned tabs are excluded outright (always available).
          // Hidden favorites are NOT excluded here — they come back flagged so
          // the page can show them dimmed with a "Bring back" action.
          const excludedKeys = new Set(
            (activeTabs || [])
              .filter((tab) => tab.pinned)
              .map((tab) => tab.urlKey)
          );
          const openKeys = new Set(
            (activeTabs || [])
              .filter((tab) => !tab.pinned)
              .map((tab) => tab.urlKey)
          );
          const hiddenKeys = new Set(favoritesHidden || []);
          Chrome.get('ViewAllFavorites3', keys, (records) => {
            setFavorites(
              rankFavorites(keys, records, Infinity, excludedKeys, {
                openKeys,
                hiddenKeys,
                now: at,
              })
            );
          });
        }
      );
    };

    load();

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
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
    Chrome.get('ViewAllFavorites4', 'activeTabs', (result) => {
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

  // The inverse of Favorites' removeFavorite: drop the urlKey from
  // favoritesHidden so the site returns to the sidebar Favorites section.
  const bringBack = (e, favorite) => {
    e.stopPropagation();
    Chrome.get('ViewAllFavorites5', 'favoritesHidden', ({ favoritesHidden }) => {
      const hidden = favoritesHidden || [];
      if (!hidden.includes(favorite.urlKey)) return;
      chrome.storage.local.set({
        favoritesHidden: hidden.filter((key) => key !== favorite.urlKey),
      });
    });
  };

  // A common maximum so every row's sparklines share one scale and bar heights
  // are comparable across rows (a busy site reads visibly taller than a quiet one).
  const maxCount = usageMax(favorites, now);

  return (
    <div className="ViewAllFavorites">
      <button className="Page-back" onClick={back}>
        <Icon name="arrowLeft" size={15} /> Home
      </button>
      <h1 className="Page-h1">Favorites</h1>
      <p className="Page-intro">
        Ranked by how often and how recently you visit — recent visits count
        more.
      </p>

      {favorites.map((favorite) => (
        <FavoriteRow
          key={favorite.urlKey}
          favorite={favorite}
          now={now}
          maxCount={maxCount}
          onOpen={openFavorite}
          onBringBack={bringBack}
        />
      ))}

      {favorites.length === 0 && (
        <div className="ViewAllFavorites-empty">
          No favorites yet — the sites you return to will show up here as you
          browse.
        </div>
      )}
    </div>
  );
};

export default ViewAllFavorites;
