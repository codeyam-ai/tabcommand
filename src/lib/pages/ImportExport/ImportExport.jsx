import './ImportExport.css';

import React, { useEffect, useState } from 'react';

import { Chrome } from '../../utils/Chrome';
import { PageHeader } from '../../components/PageHeader';
import { SyncWarning } from '../../components/SyncWarning';
import { ImportPanel } from '../../components/ImportPanel';
import { ExportPanel } from '../../components/ExportPanel';
import { SYNC_STATUS_KEY } from '../../utils/storageAccess';
import {
  sortLabels,
  collectUrlKeys,
  resolveLabelUrls,
  buildImportUpdates,
} from '../../utils/importExport';
import { parseImportSnapshot, describeImport, ImportFailure } from '../../utils/importSnapshot';

// The Import / Export page: a recover/backup view reached from the sidebar
// "Import/Export" link. It serializes the user's groups (labels + their member
// URLs) to JSON for Export, shows prior snapshots under Previous, and restores
// groups from a pasted snapshot via Import.
//
// The page owns the storage orchestration and nothing else — every visual part
// of it is a component.
const ImportExport = ({ onComplete }) => {
  const [importLabels, setImportLabels] = useState("");
  const [exportLabels, setExportLabels] = useState("");
  const [previousLabels, setPreviousLabels] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importNotice, setImportNotice] = useState(null);

  useEffect(() => {
    let _previousLabels = [];
    const sortAndStuff = (labels, callback) => {
      const sortedLabels = sortLabels(labels);
      const labelUrlKeys = collectUrlKeys(sortedLabels);

      Chrome.get('ImportExport1', labelUrlKeys, (result) => {
        callback(JSON.stringify(resolveLabelUrls(sortedLabels, result)));
      });
    };

    // One read spanning BOTH storage areas: `labels` comes from sync,
    // `previousLabels` and `syncStatus` from local. Chrome.get fans out and
    // re-merges, so this stays a single call with a single callback.
    Chrome.get('ImportExport2', ['labels', 'previousLabels', SYNC_STATUS_KEY], async (result) => {
      sortAndStuff(result.labels, (sorted) => setExportLabels(sorted));

      setSyncStatus(result[SYNC_STATUS_KEY] || null);

      const previousLabelsResult = result.previousLabels;
      for (const previous of previousLabelsResult) {
        sortAndStuff(previous, (sorted) => {
          _previousLabels.push(sorted);
          if (_previousLabels.length === previousLabelsResult.length) {
            setPreviousLabels(_previousLabels);
          }
        });
      }
    });
  }, []);

  // Restore the pasted snapshot.
  //
  // The old version logged every failure to a console the user cannot see and
  // then called `onComplete()` unconditionally — so the page closed on failure
  // exactly as it does on success, and a failed import was indistinguishable
  // from a successful one that did nothing. Three rules replace that:
  //
  //   - Failures are rendered, not logged, and the page STAYS OPEN with the
  //     pasted text intact. That is what makes a failure recoverable.
  //   - Success is confirmed from storage. `Chrome.set` is fire-and-forget, so
  //     "no exception was thrown" does not mean "the groups were written."
  //   - An import that needed repair, or that lost groups, reports what happened
  //     and stays on the page so the user actually reads it. Only a clean,
  //     complete restore closes the page.
  const saveImport = () => {
    setImportError(null);
    setImportNotice(null);

    // An empty paste is not an error — there is nothing to do and nothing to
    // destroy, so say nothing.
    if (!importLabels || !importLabels.trim().length) return;

    const parsed = parseImportSnapshot(importLabels);
    if (!parsed.ok) {
      if (parsed.failure === ImportFailure.EMPTY) return;
      setImportError(parsed.message);
      return;
    }

    let updates;
    try {
      updates = buildImportUpdates(parsed.labels);
    } catch (e) {
      setImportError(`That snapshot could not be imported: ${e.message}`);
      return;
    }

    Chrome.set('ImportExport3', updates);

    Chrome.get('ImportExport4', ['labels'], (result) => {
      const restored = Object.keys(result.labels || {}).length;
      if (!restored) {
        setImportError(
          'The groups could not be saved. Your snapshot is still in the box '
          + 'above — copy it somewhere safe and try again.',
        );
        return;
      }

      const notice = describeImport(parsed);
      if (notice) {
        // Leaving the page now would take the only account of what was repaired
        // or lost with it.
        setImportNotice(notice);
        return;
      }

      if (onComplete) onComplete();
    });
  }

  return (
    <div className="ImportExport">
      <PageHeader
        title="Import / Export"
        intro="Recover your tab information if a bug ever happens. Paste a saved snapshot into Import to restore your groups, or copy a snapshot below to keep a working backup."
        onBack={onComplete}
      />

      <SyncWarning status={syncStatus} />

      <ImportPanel
        value={importLabels}
        onChange={setImportLabels}
        onImport={saveImport}
        error={importError}
        notice={importNotice}
      />

      <ExportPanel current={exportLabels} previous={previousLabels} />
    </div>
  );
}

export default ImportExport;
