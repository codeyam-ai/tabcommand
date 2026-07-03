import './FavoriteRow.css';

import React, { useState } from 'react';

import { relativeTime } from '../../utils/relativeTime';
import { bucketVisitsByDay, SPARK_DAYS } from '../../utils/bucketVisitsByDay';
import { bucketVisitsByWeek, SPARK_WEEKS } from '../../utils/bucketVisitsByWeek';
import { Favicon } from '../Favicon';
import { Icon } from '../Icon';
import { UsageSparkline } from '../UsageSparkline';

const DAY_MS = 1000 * 60 * 60 * 24;
const WEEK_MS = DAY_MS * 7;
const DAY_FMT = { weekday: 'short', month: 'short', day: 'numeric' };
const SHORT_FMT = { month: 'short', day: 'numeric' };

// One favorite on the Favorites View All page: favicon, title, a stats strip
// that explains the rank (visit count in the window, last-visited via
// relativeTime, the decay score), and a UsageSparkline of usage over time.
// Clicking the row EXPANDS it to reveal the per-day visit breakdown behind the
// sparkline. An explicit open link beside the title opens/focuses the site's
// tab (the row click no longer does — it toggles the detail). A site open in a
// tab gets the accent open cue; a hidden (removed) favorite is dimmed and shows
// a Bring back button instead of being filtered out.
//
// `favorite` is a row from `rankFavorites`:
//   { urlKey, url, title, favicon, isOpen, isHidden, score, visitCount,
//     lastVisit, recentVisits }
// `now` pins the relative-time / sparkline / breakdown rendering; `maxCount` is
// the page-wide common maximum the two sparklines scale to (so rows compare);
// onOpen(e, favorite) opens or focuses the tab; onBringBack(e, favorite) un-hides
// a hidden row.
const FavoriteRow = ({ favorite, now, maxCount, onOpen, onBringBack }) => {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => setExpanded((e) => !e);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  // The per-day and per-week counts the two sparklines are drawn from, newest
  // first, keeping only buckets that actually had visits — "the data behind the
  // graph".
  const perDay = bucketVisitsByDay(favorite.recentVisits, now)
    .map((count, i) => ({ count, index: i }))
    .filter((d) => d.count > 0)
    .reverse()
    .map((d) => ({
      count: d.count,
      label: new Date(
        now - (SPARK_DAYS - 1 - d.index) * DAY_MS
      ).toLocaleDateString(undefined, DAY_FMT),
    }));
  const perWeek = bucketVisitsByWeek(favorite.recentVisits, now)
    .map((count, i) => ({ count, index: i }))
    .filter((w) => w.count > 0)
    .reverse()
    .map((w) => {
      const weeksAgo = SPARK_WEEKS - 1 - w.index;
      const end = now - weeksAgo * WEEK_MS;
      const start = new Date(end - 6 * DAY_MS).toLocaleDateString(
        undefined,
        SHORT_FMT
      );
      const endLabel = new Date(end).toLocaleDateString(undefined, SHORT_FMT);
      return { count: w.count, label: `${start} – ${endLabel}` };
    });

  return (
    <div
      className={
        'FavoriteRow' +
        (favorite.isOpen ? ' FavoriteRow--open' : '') +
        (favorite.isHidden ? ' FavoriteRow--hidden' : '') +
        (expanded ? ' FavoriteRow--expanded' : '')
      }
    >
      <div
        className="FavoriteRow-header"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        title={`${favorite.title || favorite.url}\n\n${favorite.url}`}
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        <Icon
          name={expanded ? 'chevronDown' : 'chevronRight'}
          size={14}
          className="FavoriteRow-caret"
        />
        <Favicon
          favicon={favorite.favicon}
          urlKey={favorite.urlKey}
          title={favorite.title}
        />
        <div className="FavoriteRow-main">
          <div className="FavoriteRow-titleRow">
            <span className="FavoriteRow-title">{favorite.title}</span>
            <button
              type="button"
              className="FavoriteRow-open"
              aria-label={`Open ${favorite.title || favorite.url}`}
              title={`Open ${favorite.url}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(e, favorite);
              }}
            >
              <Icon name="globe" size={13} />
            </button>
          </div>
          <div className="FavoriteRow-stats">
            <span className="FavoriteRow-stat">
              {favorite.visitCount} {favorite.visitCount === 1 ? 'visit' : 'visits'}
            </span>
            <span className="FavoriteRow-stat">
              last {relativeTime(favorite.lastVisit, now)}
            </span>
            <span className="FavoriteRow-stat FavoriteRow-stat--score">
              score {favorite.score.toFixed(2)}
            </span>
          </div>
        </div>
        <UsageSparkline visits={favorite.recentVisits} now={now} max={maxCount} />
        {favorite.isHidden && (
          <button
            type="button"
            className="FavoriteRow-bringback"
            onClick={(e) => {
              e.stopPropagation();
              onBringBack(e, favorite);
            }}
          >
            <Icon name="restore" size={13} /> Bring back
          </button>
        )}
      </div>

      {expanded && (
        <div className="FavoriteRow-detail">
          <div className="FavoriteRow-detail-col">
            <div className="FavoriteRow-detail-title">
              Last {SPARK_DAYS} days
            </div>
            {perDay.length > 0 ? (
              <ul className="FavoriteRow-detail-list">
                {perDay.map((day) => (
                  <li key={day.label} className="FavoriteRow-detail-row">
                    <span className="FavoriteRow-detail-date">{day.label}</span>
                    <span className="FavoriteRow-detail-count">
                      {day.count} {day.count === 1 ? 'visit' : 'visits'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="FavoriteRow-detail-empty">
                No visits in the last {SPARK_DAYS} days.
              </div>
            )}
          </div>
          <div className="FavoriteRow-detail-col">
            <div className="FavoriteRow-detail-title">
              Last {SPARK_WEEKS} weeks
            </div>
            {perWeek.length > 0 ? (
              <ul className="FavoriteRow-detail-list">
                {perWeek.map((week) => (
                  <li key={week.label} className="FavoriteRow-detail-row">
                    <span className="FavoriteRow-detail-date">{week.label}</span>
                    <span className="FavoriteRow-detail-count">
                      {week.count} {week.count === 1 ? 'visit' : 'visits'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="FavoriteRow-detail-empty">
                No visits in the last {SPARK_WEEKS} weeks.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FavoriteRow;
