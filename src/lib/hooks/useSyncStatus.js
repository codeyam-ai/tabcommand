import { useEffect, useState } from 'react';

import { Chrome } from '../utils/Chrome';
import { SYNC_STATUS_KEY } from '../utils/storageAccess';
import { changedInArea } from '../utils/storageAreas';

// Where a dismissal is remembered. Unregistered in STORAGE_AREAS, so it routes
// to local by default — which is where it belongs: a note about a warning the
// user has already read is not worth a slot in the 8 KB sync budget, and like
// `syncStatus` itself it must not depend on sync working.
export const SYNC_WARNING_DISMISSED_KEY = 'syncWarningDismissedAt';

// The degraded-sync banner state, for any surface that wants to show it.
//
// The Import / Export page renders the warning unconditionally — the user opened
// the backup page, so the news is exactly what they came for. Everywhere else it
// has to be dismissible, because the alternative is a banner permanently parked
// above the user's groups.
//
// Dismissal is deliberately PER-INCIDENT rather than permanent. It records the
// `at` of the status record being dismissed, and `writeByArea` only writes a new
// status record when the status actually CHANGES — so `at` holds still while
// sync stays broken (dismissed stays dismissed) and moves when sync recovers and
// then fails again. That second failure is new information and says so.
export const useSyncStatus = () => {
  const [status, setStatus] = useState(null);
  const [dismissedAt, setDismissedAt] = useState(null);

  useEffect(() => {
    Chrome.get('useSyncStatus1', [SYNC_STATUS_KEY, SYNC_WARNING_DISMISSED_KEY], (result) => {
      setStatus(result[SYNC_STATUS_KEY] || null);
      setDismissedAt(result[SYNC_WARNING_DISMISSED_KEY] || null);
    });

    // Both keys are local, but gate each against ITS OWN area rather than
    // assuming — the areas fire separately and one event carries only one of
    // them, which is the trap `changedInArea` exists to close.
    const handleChange = (changes, areaName) => {
      const statusChange = changedInArea(changes, areaName, SYNC_STATUS_KEY);
      if (statusChange) setStatus(statusChange.newValue || null);

      const dismissChange = changedInArea(changes, areaName, SYNC_WARNING_DISMISSED_KEY);
      if (dismissChange) setDismissedAt(dismissChange.newValue || null);
    };

    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const dismiss = () => {
    const at = (status && status.at) || Date.now();
    setDismissedAt(at);
    Chrome.set('useSyncStatus2', { [SYNC_WARNING_DISMISSED_KEY]: at });
  };

  const dismissed = !!status && status.at != null && status.at === dismissedAt;

  return { status: dismissed ? null : status, dismiss };
};

export default useSyncStatus;
