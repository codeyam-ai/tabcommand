import './App.css';

import React, { useEffect, useRef, useState } from 'react';
import { Tabs, Labels, LoadMeter, Search, AppBrand, ThemeToggle, Triage, Settings, Favorites, SearchHint } from '../../components';
import { Load } from '../Load';
import { ImportExport } from '../ImportExport';
import { UrlDetails } from '../UrlDetails';
import { History } from '../History';
import { ViewAllFavorites } from '../ViewAllFavorites';
import { ItemTypes, Pages } from '../../../Constants';

import { DragDropContext } from '@hello-pangea/dnd';

import { Chrome } from '../../utils/Chrome';
import { changedInArea } from '../../utils/storageAreas';
import { applyDrag } from '../../utils/dragReducer';
import appendGroupingLog from '../../utils/groupingLog';
import { describeDragRemoval } from '../../utils/describeDragRemoval';
import { describeDragAddition } from '../../utils/describeDragAddition';
import {
  buildGroupRemovalEntry,
  GROUP_REMOVAL_LOG_KEY,
  GROUP_REMOVAL_LOG_CAP,
  RemovalSource
} from '../../utils/groupRemovalLog';
import {
  buildGroupAdditionEntry,
  GROUP_ADDITION_LOG_KEY,
  GROUP_ADDITION_LOG_CAP,
  AdditionSource
} from '../../utils/groupAdditionLog';
import { dropTargetIdAtPoint } from '../../utils/dropTargeting';
import { hasPerTabLoadData } from '../../utils/hasPerTabLoadData';
import { setDragHover, getDragHover, setDragActive } from '../../utils/dragHoverStore';
import { useTheme } from '../../hooks/useTheme';

// A normal drop fires `pointerup` well before @hello-pangea/dnd reports
// `onDragEnd` (which waits out the drop animation), so the abort net below is
// armed on a delay and disarmed by `onDragEnd`. It only ever fires for a drag
// the library has genuinely lost.
const DRAG_ABORT_GRACE_MS = 1000;

const App = () => {
  const [page, setPage] = useState({ name: Pages.HOME });
  const [theme, toggleTheme] = useTheme();
  const [reviewMode, setReviewMode] = useState(false);
  const [counts, setCounts] = useState({ tabs: 0, groups: 0 });

  // Mirrors the gate LoadMeter itself uses. The meter self-hides without per-tab
  // data, so without this the footer would still render an empty .App-gauge —
  // and its border-bottom would stack a second hairline under the footer's own.
  const [loadSource, setLoadSource] = useState(null);

  // Holds the teardown for the in-flight drag's pointer tracking (see
  // handleDragStart). The hovered group itself lives in the dragHoverStore, not
  // React state, so tracking the cursor never re-renders this component (which
  // would cancel the drag).
  const hoverCleanupRef = useRef(null);

  // Pending timer for the drag-abort safety net (see handleDragStart).
  const dragAbortTimerRef = useRef(null);

  useEffect(() => {
    Chrome.get('App1', 'uxSettings', ({ uxSettings }) => {
      if (uxSettings.page && uxSettings.page !== page) {
        setPage(uxSettings.page || { name: Pages.HOME });
      }
    });

    const refreshCounts = () => {
      Chrome.get('AppCounts', ['labels', 'activeTabs'], ({ labels, activeTabs }) => {
        setCounts({
          tabs: (activeTabs || []).length,
          groups: Object.keys(labels || {}).length,
        });
      });
    };
    refreshCounts();

    Chrome.get('AppLoadSource', 'loadDataSource', ({ loadDataSource }) => {
      setLoadSource(loadDataSource || null);
    });

    const handleChange = (changes, areaName) => {
      // `labels` is in sync, the rest of the keys read here are local, and one
      // event carries only one area's keys — so a blanket local-only guard left
      // the footer's group count frozen after every group add or delete.
      const labelsChange = changedInArea(changes, areaName, 'labels');
      const isLocal = areaName === 'local';
      if (!labelsChange && !isLocal) return;
      if (labelsChange) refreshCounts();
      if (!isLocal) return;
      if (changes.uxSettings) {
        const newValue = changes.uxSettings.newValue || {};
        if (newValue.page !== page) {
          setPage(newValue.page || { name: Pages.HOME });
        }
      }
      if (changes.activeTabs) refreshCounts();
      if (changes.loadDataSource) setLoadSource(changes.loadDataSource.newValue || null);
    };

    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const stopHoverTracking = () => {
    if (hoverCleanupRef.current) hoverCleanupRef.current();
  };

  const cancelDragAbortTimer = () => {
    if (!dragAbortTimerRef.current) return;
    clearTimeout(dragAbortTimerRef.current);
    dragAbortTimerRef.current = null;
  };

  // Everything a drag must undo, however it ends. Idempotent — guarded by
  // hoverCleanupRef — so the library's onDragEnd and the window-level fallback
  // listeners can both call it without fighting. Clearing `dragActive` is what
  // flushes the list updates the sidebar and group cards buffered mid-drag.
  const endDragCleanup = () => {
    const labelsElement = document.getElementById('Labels');
    if (labelsElement) labelsElement.classList.remove('Labels-dragging');
    stopHoverTracking();
    setDragActive(false);
  };

  // The heart of TabCommand: dropping a tab into a group moves its urlKey into
  // that label, and dragging a group reorders the grid. The transform itself
  // lives in the testable `applyDrag` reducer; here we persist the result and
  // ungroup any real Chrome tabs that left an active label.
  const handleDrag = (dragResult) => {
    cancelDragAbortTimer();

    // For a mouse drag, the tab drops into whichever group the cursor is over —
    // overriding @hello-pangea/dnd's center-based destination. If the cursor
    // isn't over any group, there is no drop (a tab released in empty space or
    // back in the sidebar stays put). Keyboard drags keep the library's target.
    // Read the hover state BEFORE the cleanup below clears it.
    const { cursorActive, dropId: cursorDropId } = getDragHover();
    endDragCleanup();

    let result = dragResult;
    if (dragResult.type === ItemTypes.URL && cursorActive) {
      if (!cursorDropId) return;
      result = { ...dragResult, destination: { droppableId: cursorDropId, index: 0 } };
    }

    if (!result.destination || !result.destination.droppableId) return;

    Chrome.get('App3', ['labels', 'activeTabs', GROUP_REMOVAL_LOG_KEY, GROUP_ADDITION_LOG_KEY], ({ labels, activeTabs, [GROUP_REMOVAL_LOG_KEY]: removalLog, [GROUP_ADDITION_LOG_KEY]: additionLog }) => {
      const dropResult = applyDrag(result, { labels, activeTabs });
      if (!dropResult) return;

      dropResult.ungroupTabIds.forEach((tabId) => {
        if (chrome.tabs.ungroup) chrome.tabs.ungroup(tabId);
      });

      const updates = { labels: dropResult.labels };

      // A drag out of a source group removes that member (it's re-inserted into
      // the destination — a move, not a loss — but recording it lets us rule
      // drags in or out when diagnosing a future disappearance).
      const removal = describeDragRemoval(result, dropResult.labels);
      if (removal) {
        updates[GROUP_REMOVAL_LOG_KEY] = appendGroupingLog(
          removalLog,
          buildGroupRemovalEntry(RemovalSource.UI_DRAG, { ...removal, t: Date.now() }),
          GROUP_REMOVAL_LOG_CAP
        );
      }

      // The mirror side of the same drop: the destination group gained a member.
      // Recorded unconditionally alongside the removal so a member that appeared
      // out of nowhere can be traced to a drag rather than inferred from its
      // absence in the worker trail.
      const addition = describeDragAddition(result, dropResult.labels);
      if (addition) {
        updates[GROUP_ADDITION_LOG_KEY] = appendGroupingLog(
          additionLog,
          buildGroupAdditionEntry(AdditionSource.UI_DRAG, { ...addition, t: Date.now() }),
          GROUP_ADDITION_LOG_CAP
        );
      }

      Chrome.set('App2', updates);
    });
  };

  const handleDragStart = (info) => {
    // Every drag freezes the lists — keyboard as well as mouse, group reorders
    // as well as tabs. A background storage write that re-renders (and re-sorts)
    // a list mid-drag is what cancels the drag and strands the dragged row.
    setDragActive(true);

    const labelsElement = document.getElementById('Labels');
    if (labelsElement) labelsElement.classList.add('Labels-dragging');

    // Only a fluid (pointer) drag on a tab has a cursor to follow; keyboard
    // drags report mode 'SNAP' and keep @hello-pangea/dnd's built-in targeting
    // and highlight, and group reorders use the library's own destination.
    const tracksCursor = info.mode === 'FLUID' && info.type === ItemTypes.URL;

    const onPointerMove = (event) => {
      const point = (event.touches && event.touches[0]) || event;
      setDragHover({ cursorActive: true, dropId: dropTargetIdAtPoint(point.clientX, point.clientY) });
    };

    if (tracksCursor) {
      setDragHover({ cursorActive: true, dropId: null });
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('touchmove', onPointerMove);
    }

    // Safety net, not the mechanism: the real fix is that the drag no longer
    // gets cancelled. But if the library ever loses one anyway — a swallowed
    // pointerup, the window losing focus — this unwedges the UI instead of
    // leaving the grid unscrollable with a group stuck highlighted. Armed on a
    // delay because a healthy drop fires pointerup first; onDragEnd disarms it.
    const onAbort = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      cancelDragAbortTimer();
      dragAbortTimerRef.current = setTimeout(() => {
        dragAbortTimerRef.current = null;
        endDragCleanup();
      }, DRAG_ABORT_GRACE_MS);
    };

    window.addEventListener('pointerup', onAbort);
    window.addEventListener('pointercancel', onAbort);
    window.addEventListener('blur', onAbort);
    window.addEventListener('keydown', onAbort);

    hoverCleanupRef.current = () => {
      if (tracksCursor) {
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('touchmove', onPointerMove);
      }
      window.removeEventListener('pointerup', onAbort);
      window.removeEventListener('pointercancel', onAbort);
      window.removeEventListener('blur', onAbort);
      window.removeEventListener('keydown', onAbort);
      hoverCleanupRef.current = null;
      setDragHover({ cursorActive: false, dropId: null });
    };
  };

  useEffect(() => () => {
    cancelDragAbortTimer();
    endDragCleanup();
  }, []);

  const changePage = (pageName) => {
    Chrome.get('App2', 'uxSettings', ({ uxSettings }) => {
      if (uxSettings.page === page) return;
      uxSettings.page = { name: pageName };
      Chrome.set('App1', { uxSettings: uxSettings });
    });
  }

  const isHome = page.name === Pages.HOME;

  return (
    <div className="App">
      <div className="App-sidebar">
        <div className="App-sidebar-header">
          <AppBrand onClick={() => changePage(Pages.HOME)} />
          <div className="App-sidebar-tools">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            {isHome && <Settings />}
          </div>
        </div>
        <Search />

        {isHome && <SearchHint />}

        {isHome && <Favorites />}

        <div className='App-sidebar-footer'>
          {isHome && (
            <Triage
              reviewMode={reviewMode}
              onToggleReview={() => setReviewMode((r) => !r)}
            />
          )}
          {/* The wrapper is gated too, not just the meter: an empty .App-gauge
              would still draw its divider hairline (and hold a click target)
              above the counts on stable Chrome. */}
          {hasPerTabLoadData(loadSource) && (
            <div className="App-gauge" onClick={() => changePage(Pages.LOAD)}>
              <LoadMeter />
            </div>
          )}
          {isHome && (
            <div className="App-sidebar-counts">
              {counts.tabs} {counts.tabs === 1 ? 'tab' : 'tabs'} · {counts.groups}{' '}
              {counts.groups === 1 ? 'group' : 'groups'}
            </div>
          )}
          <div
            className='App-sidebar-link'
            onClick={() => changePage(Pages.IMPORTEXPORT)}
          >
            Import/Export
          </div>
        </div>
      </div>
      <div className="App-content">
        {page.name === Pages.URL &&
          <UrlDetails urlKey={page.urlKey} />
        }
        {page.name === Pages.IMPORTEXPORT &&
          <ImportExport onComplete={() => changePage(Pages.HOME)} />
        }
        {page.name === Pages.LOAD &&
          <Load />
        }
        {page.name === Pages.HISTORY &&
          <History />
        }
        {page.name === Pages.FAVORITES &&
          <ViewAllFavorites />
        }
        {isHome &&
          <DragDropContext onDragEnd={handleDrag} onDragStart={handleDragStart}>
            <div className="App-home">
              <Labels />
              <Tabs reviewMode={reviewMode} />
            </div>
          </DragDropContext>
        }
      </div>
    </div>
  );
}

export default App;
