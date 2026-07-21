import './ViewAllFavorites.css';

import React, { useEffect, useState } from 'react';

import { Chrome } from '../../utils/Chrome';
import { hiddenSiteKey, hiddenSiteKeys } from '../../utils/hiddenSiteKeys';
import { rankFavorites } from '../../utils/rankFavorites';
import { usageMax } from '../../utils/usageMax';
import { Pages } from '../../../Constants';
import { Icon, FavoriteRow, FavoritesResetControl } from '../../components';

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
        ['allUrls', 'activeTabs', 'favoritesHidden', 'siteVisits'],
        ({ allUrls, activeTabs, favoritesHidden, siteVisits }) => {
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
          // Flag hidden sites at the SITE level, matching how the sidebar hides
          // them: a removed multi-page site must render dimmed no matter which of
          // its pages is currently the representative, otherwise the row silently
          // reappears undimmed and "Bring back" is unreachable.
          const hiddenSites = hiddenSiteKeys(favoritesHidden);
          Chrome.get('ViewAllFavorites3', keys, (records) => {
            setFavorites(
              rankFavorites(keys, records, Infinity, excludedKeys, {
                openKeys,
                hiddenSites,
                now: at,
                siteVisits: siteVisits || {},
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
          key === 'siteVisits' ||
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

  // The exact inverse of Favorites' removeFavorite: drop the SITE from
  // favoritesHidden so it returns to the sidebar Favorites section.
  //
  // Every entry that normalizes to this site's key is removed, not just the one
  // matching the representative — including legacy `url-*` page entries written
  // before removal became site-level. Removing only one would leave the site's
  // other entries behind, so it would stay hidden despite the click: half-restored
  // and, with no dimmed row left to click, permanently stuck that way.
  const bringBack = (e, favorite) => {
    e.stopPropagation();
    Chrome.get('ViewAllFavorites5', 'favoritesHidden', ({ favoritesHidden }) => {
      const hidden = favoritesHidden || [];
      // Normalized the same way the stored entries are, so this is exactly the
      // group key rankFavorites rolled this row up under.
      const target = hiddenSiteKey(favorite.url);
      const remaining = hidden.filter(
        (entry) => hiddenSiteKey(entry) !== target
      );
      if (remaining.length === hidden.length) return;
      chrome.storage.local.set({ favoritesHidden: remaining });
    });
  };

  // "Start over" on the favorites ranking: zero the visit signal (visits /
  // visitCount) on every url-* record, EMPTY the durable site-level `siteVisits`
  // store, and clear favoritesHidden, so with no visits every site falls below
  // rankFavorites' QUALIFY_MIN and the list goes empty. Clearing `siteVisits` is
  // what makes the reset actually reset: it is now the authoritative history, so
  // zeroing only the url-* records would leave every site's real visits behind and
  // the list would come back unchanged. Each record is rewritten IN PLACE — title,
  // favicon, url and every other field are preserved — because url-* records are
  // shared with History & Search, which must stay intact. Zeroing visitCount as
  // well as visits stops rankFavorites from lazily re-seeding visits from a legacy
  // count.
  const resetFavorites = () => {
    Chrome.get('ViewAllFavoritesReset0', 'allUrls', ({ allUrls }) => {
      const keys = allUrls || [];
      const finish = (updates) => {
        chrome.storage.local.set({
          ...updates,
          favoritesHidden: [],
          siteVisits: {},
        });
      };
      if (keys.length === 0) return finish({});
      Chrome.get('ViewAllFavoritesReset1', keys, (records) => {
        const updates = {};
        for (const key of keys) {
          const rec = records[key];
          if (!rec) continue; // key with no record — nothing to clear
          updates[key] = { ...rec, visits: [], visitCount: 0 };
        }
        finish(updates);
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

      <FavoritesResetControl onReset={resetFavorites} />

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
