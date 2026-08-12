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
export const SYNC_WARNINGS = {
  [SyncStatus.TOO_LARGE]:
    'Your groups are too large to back up to your Google account (the limit is about 8 KB). ' +
    'They are still saved on this computer, but they will not sync and will not survive a ' +
    'reinstall. Copy the Export snapshot below and keep it somewhere safe, then consider ' +
    'deleting groups you no longer need.',
  [SyncStatus.FAILED]:
    'Your groups could not be backed up to your Google account. This usually means you are ' +
    'signed out of Chrome or extension sync is turned off. They are still saved on this ' +
    'computer, but they will not survive a reinstall. Copy the Export snapshot below to keep ' +
    'a backup.',
};

// Renders the warning for a `syncStatus` record, or nothing at all.
//
// Returns null for the three non-alarming cases — no record yet, a healthy
// `ok` status, and an unrecognized status from a future version — so the banner
// only ever appears when there is something the user must act on.
const SyncWarning = ({ status }) => {
  const message = status ? SYNC_WARNINGS[status.status] : null;
  if (!message) return null;

  return (
    <div className="SyncWarning" role="alert">
      <Icon name="info" size={16} />
      <span>{message}</span>
    </div>
  );
};

export default SyncWarning;
