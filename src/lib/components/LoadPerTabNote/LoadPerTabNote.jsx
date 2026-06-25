import './LoadPerTabNote.css';

import React, { useEffect, useState } from 'react';
import { Chrome } from '../../utils/Chrome';

// The honest note shown on the Load page when per-tab CPU/memory data is
// unavailable. Per-tab/per-process data only exists on Chrome's Dev channel
// (chrome.processes); on stable Chrome the service worker records
// loadDataSource 'system' (or 'none'), so the per-tab bars and the process
// table are empty by necessity. This note makes that empty area read as
// intentional rather than broken. Owns its own loadDataSource read (like its
// LoadUrl / LoadProcesses siblings own their data); renders nothing on the
// full-fidelity 'processes' source or before the marker is known.
const LoadPerTabNote = () => {
  const [source, setSource] = useState(null);

  useEffect(() => {
    Chrome.get('LoadPerTabNote1', 'loadDataSource', (result) => {
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

  if (!source || source === 'processes') return null;

  return (
    <div className='LoadPerTabNote'>
      Per-tab CPU &amp; memory needs Chrome&rsquo;s Dev channel
      (<code>chrome.processes</code>). On this build the gauge shows
      whole-browser load only; per-tab bars and the process table are
      unavailable.
    </div>
  );
};

export default LoadPerTabNote;
