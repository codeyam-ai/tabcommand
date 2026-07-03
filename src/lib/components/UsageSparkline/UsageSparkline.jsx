import './UsageSparkline.css';

import React from 'react';

import { bucketVisitsByDay, SPARK_DAYS } from '../../utils/bucketVisitsByDay';
import { bucketVisitsByWeek, SPARK_WEEKS } from '../../utils/bucketVisitsByWeek';

// Two inline bar charts side by side — the "see why this favorite ranks here"
// payload on a FavoriteRow. The left chart is the last SPARK_DAYS days (recent
// daily rhythm); the right is the last SPARK_WEEKS weeks (longer-term trend,
// which varies in height even when daily usage is a steady one-per-day). No
// charting library. `max` is a common maximum the page passes so every row's
// bars share one scale and are comparable across rows; omit it and each chart
// self-scales to its own busiest bucket. Visited buckets are tinted the accent.
const UsageSparkline = ({ visits, now, max }) => {
  const charts = [
    { buckets: bucketVisitsByDay(visits, now), unit: `${SPARK_DAYS}d`, label: 'days' },
    { buckets: bucketVisitsByWeek(visits, now), unit: `${SPARK_WEEKS}w`, label: 'weeks' },
  ];
  return (
    <div className="UsageSparkline">
      {charts.map((chart) => {
        const scale = max && max > 0 ? max : Math.max(1, ...chart.buckets);
        return (
          <div key={chart.unit} className="UsageSparkline-group">
            <div
              className="UsageSparkline-bars"
              aria-label={`Usage over the last ${chart.buckets.length} ${chart.label}`}
            >
              {chart.buckets.map((count, i) => (
                <span
                  key={i}
                  className={
                    'UsageSparkline-bar' +
                    (count > 0 ? ' UsageSparkline-bar--on' : '')
                  }
                  style={{ height: `${Math.round((count / scale) * 100)}%` }}
                  title={`${count} visit${count === 1 ? '' : 's'}`}
                />
              ))}
            </div>
            <div className="UsageSparkline-label">{chart.unit}</div>
          </div>
        );
      })}
    </div>
  );
};

export default UsageSparkline;
