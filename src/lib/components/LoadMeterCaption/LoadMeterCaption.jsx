import './LoadMeterCaption.css';

import React, { useEffect, useState } from 'react';
import { Chrome } from '../../utils/Chrome';

// The honest, source-aware label rendered beneath the LoadMeter gauge. It reads
// the `loadDataSource` storage marker the service worker writes:
//   'processes' — Dev/Canary per-process data (full fidelity) → no caption
//   'system'    — stable-Chrome whole-browser/OS load → "Whole-browser load"
//   'none'      — no load API available → "No load data" (so the empty gauge
//                 reads as legible rather than silently broken)
// Owns its own storage read (like LoadProcesses owns its data) so the gauge
// component stays purely about the arcs.
const LoadMeterCaption = () => {
  const [source, setSource] = useState(null);

  useEffect(() => {
    Chrome.get('LoadMeterCaption1', 'loadDataSource', (result) => {
      setSource(result.loadDataSource || null);
    });

    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.loadDataSource) {
        setSource(changes.loadDataSource.newValue || null);
      }
    };
    chrome.storage.onChanged.addListener(handleChange);

    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  if (source === 'none') {
    return (
      <div className='LoadMeterCaption LoadMeterCaption--none'>
        No load data
      </div>
    );
  }

  if (source === 'system') {
    return (
      <div
        className='LoadMeterCaption'
        title='Per-tab load needs Chrome&rsquo;s Dev channel'
      >
        Whole-browser load
      </div>
    );
  }

  return null;
};

export default LoadMeterCaption;
