import './SyncWarning.css';

import React from 'react';

import { Icon } from '../Icon';
import { SyncStatus } from '../../utils/storageAccess';

// What to tell the user when their groups are NOT reaching `chrome.storage.sync`.
//
// Groups live in sync so they survive an uninstall. When a write falls back to
// local they are exactly as fragile as they were before — and the user has to
// know, because the export on the Import / Export page is the recovery. Silence
// here would be worse than the old local-only behavior: it would look like the
// backup was working.
//
// The copy names the consequence in the user's terms ("will not survive a
// reinstall") and the action ("copy the Export snapshot"), never the mechanism
// — `QUOTA_BYTES_PER_ITEM` is not something to hand a user.
//
// Only the pointer to the snapshot changes by placement. On the Import / Export
// page it really is directly below the banner; on Home it is a click away, so
// saying "below" there would send the user looking for something that is not on
// the screen.
const SNAPSHOT_BELOW = 'the Export snapshot below';
const SNAPSHOT_AWAY = 'the Export snapshot on the Import/Export page';

const MESSAGES = {
  [SyncStatus.TOO_LARGE]: (snapshot) =>
    'Your groups are too large to back up to your Google account (the limit is about 8 KB). '
    + 'They are still saved on this computer, but they will not sync and will not survive a '
    + `reinstall. Copy ${snapshot} and keep it somewhere safe, then consider `
    + 'deleting groups you no longer need.',
  [SyncStatus.FAILED]: (snapshot) =>
    'Your groups could not be backed up to your Google account. This usually means you are '
    + 'signed out of Chrome or extension sync is turned off. They are still saved on this '
    + `computer, but they will not survive a reinstall. Copy ${snapshot} to keep `
    + 'a backup.',
};

export const SYNC_WARNINGS = {
  [SyncStatus.TOO_LARGE]: MESSAGES[SyncStatus.TOO_LARGE](SNAPSHOT_BELOW),
  [SyncStatus.FAILED]: MESSAGES[SyncStatus.FAILED](SNAPSHOT_BELOW),
};

// Renders the warning for a `syncStatus` record, or nothing at all.
//
// Returns null for the three non-alarming cases — no record yet, a healthy
// `ok` status, and an unrecognized status from a future version — so the banner
// only ever appears when there is something the user must act on.
//
// `onOpenBackup` and `onDismiss` are what let the same component stand somewhere
// other than the Import / Export page. Supplying `onOpenBackup` switches the copy
// to point AT that page and adds the button to get there; supplying `onDismiss`
// adds the close affordance a persistent banner needs when it sits above the
// user's groups rather than on a page they chose to open.
const SyncWarning = ({ status, onOpenBackup, onDismiss }) => {
  const build = status ? MESSAGES[status.status] : null;
  if (!build) return null;

  const message = build(onOpenBackup ? SNAPSHOT_AWAY : SNAPSHOT_BELOW);

  return (
    <div className="SyncWarning" role="alert">
      <Icon name="info" size={16} />
      <div className="SyncWarning-body">
        <span>{message}</span>
        {onOpenBackup && (
          <button type="button" className="SyncWarning-action" onClick={onOpenBackup}>
            Back up now
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="SyncWarning-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
};

export default SyncWarning;
