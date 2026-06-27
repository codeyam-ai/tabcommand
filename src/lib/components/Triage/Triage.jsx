import './Triage.css';

import React, { useEffect, useState } from 'react';
import { Chrome } from '../../utils/Chrome';
import deriveGaugeTotals from '../../utils/deriveGaugeTotals';
import { summarizeProcessLoad } from '../../utils/processLoad';
import { loadLevel } from '../../utils/loadLevel';
import { WarnAtDefault, HeavyThresholdDefault } from '../../../Constants';

// Gauge ceilings — shared with LoadMeter so the triage's "% of capacity" reads
// the same scale the gauge draws.
const MAX = { cpu: 150, memory: 5 * 1024 * 1024 * 1024 };
const BASE = { cpu: 0, memory: 500 * 1024 * 1024 };

const pct = (value, base, max) => Math.max(0, Math.min(1, (value - base) / max)) * 100;

// The sidebar triage card (Home only). Its color tracks the overall load level
// against `settings.warnAt`: red "Running hot" with a "Review N heavy tabs" CTA
// when load ≥ warnAt, amber "Getting busy" / green "Comfortable" as status-only
// (no button) below. "N heavy tabs" counts tabs whose per-tab load ≥
// heavyThreshold. The CTA toggles review mode, which is owned by App and shared
// with the Heaviest-Tabs rail section.
//
// The card renders ONLY when we actually have per-tab data
// (`loadDataSource === 'processes'`, Chrome's Dev channel). On stable Chrome the
// source is 'system'/'none' and we can't identify heavy tabs at all, so a triage
// that names culprits would be dishonest — the card hides entirely (same
// loadDataSource gate that LoadPerTabNote / LoadMeterCaption already follow).
// Even on the 'processes' source the red "Running hot" state is suppressed when
// `heavyCount === 0`: with no identifiable culprit there is nothing to point at,
// so we don't raise the alarm. The amber/green status states still render — they
// give a calm read without claiming a culprit.
const Triage = ({ reviewMode, onToggleReview }) => {
  const [{ load, heavyCount, warnAt, source }, setState] = useState({
    load: 0,
    heavyCount: 0,
    warnAt: WarnAtDefault,
    source: null,
  });

  useEffect(() => {
    const recompute = (results) => {
      const totals = deriveGaugeTotals(results.processTotals || {});
      const load = Math.max(
        pct(totals.cpu, BASE.cpu, MAX.cpu),
        pct(totals.memory, BASE.memory, MAX.memory)
      );

      const settings = results.settings || {};
      const heavyThreshold = settings.heavyThreshold ?? HeavyThresholdDefault;
      const warnAt = settings.warnAt ?? WarnAtDefault;

      const activeTabs = results.activeTabs || [];
      let heavyCount = 0;
      for (const tab of activeTabs) {
        const url = results[tab.urlKey];
        const summary = url && url.processes ? summarizeProcessLoad(url.processes) : null;
        if (summary && summary.width >= heavyThreshold) heavyCount++;
      }

      setState({ load, heavyCount, warnAt, source: results.loadDataSource || null });
    };

    const read = () => {
      Chrome.get('Triage1', ['processTotals', 'settings', 'activeTabs', 'loadDataSource'], (base) => {
        const activeTabs = base.activeTabs || [];
        const urlKeys = activeTabs.map((t) => t.urlKey);
        if (!urlKeys.length) return recompute(base);
        Chrome.get('Triage2', urlKeys, (urls) => recompute({ ...base, ...urls }));
      });
    };

    read();
    const handleChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.processTotals || changes.settings || changes.activeTabs || changes.loadDataSource) read();
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const level = loadLevel(load, warnAt);

  // Hide the whole card without per-tab data (stable Chrome / unknown source),
  // and suppress the red high state when no tab is the culprit.
  if (source !== 'processes') return null;
  if (level === 'high' && heavyCount === 0) return null;

  const title =
    level === 'high' ? 'Running hot' : level === 'medium' ? 'Getting busy' : 'Comfortable';
  const body =
    level === 'high'
      ? `${heavyCount} heavy ${heavyCount === 1 ? 'tab is' : 'tabs are'} driving load up. Close a few to bring it back down.`
      : level === 'medium'
      ? 'Load is climbing — keep an eye on your heaviest tabs.'
      : 'Plenty of headroom. Everything is running smoothly.';

  return (
    <div className={`Triage Triage-${level}`}>
      <div className="Triage-head">
        <span className="Triage-dot" />
        <span className="Triage-title">{title}</span>
      </div>
      <p className="Triage-body">{body}</p>
      {level === 'high' && (
        <button className="Triage-cta" onClick={onToggleReview}>
          {reviewMode ? 'Done reviewing' : `Review ${heavyCount} heavy ${heavyCount === 1 ? 'tab' : 'tabs'}`}
        </button>
      )}
    </div>
  );
};

export default Triage;
