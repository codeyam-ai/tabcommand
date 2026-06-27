import './ImportExport.css';

import React, { useEffect, useRef, useState } from 'react';

import { Chrome } from '../../utils/Chrome';
import { Icon } from '../../components/Icon';
import {
  sortLabels,
  collectUrlKeys,
  resolveLabelUrls,
  buildImportUpdates,
} from '../../utils/importExport';

// A read-only snapshot field with its own Copy button. The button writes the
// field's value to the clipboard and flips to a green "Copied ✓" for ~1.6s
// before reverting.
const SnapshotField = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="ImportExport-field">
      <textarea className="ImportExport-box" value={value} readOnly={true} />
      <button
        type="button"
        className={`ImportExport-copy${copied ? ' is-copied' : ''}`}
        onClick={copy}
      >
        {copied ? (
          <>
            <Icon name="check" size={14} /> Copied ✓
          </>
        ) : (
          <>
            <Icon name="copy" size={14} /> Copy
          </>
        )}
      </button>
    </div>
  );
};

// The Import / Export page: a recover/backup view reached from the sidebar
// "Import/Export" link. It serializes the user's groups (labels + their member
// URLs) to JSON for Export, shows prior snapshots under Previous, and parses
// pasted JSON to Import (restore) groups.
const ImportExport = ({ onComplete }) => {
  const [importLabels, setImportLabels] = useState("");
  const [exportLabels, setExportLabels] = useState("");
  const [previousLabels, setPreviousLabels] = useState([]);

  useEffect(() => {
    let _previousLabels = [];
    const sortAndStuff = (labels, callback) => {
      const sortedLabels = sortLabels(labels);
      const labelUrlKeys = collectUrlKeys(sortedLabels);

      Chrome.get('ImportExport1', labelUrlKeys, (result) => {
        callback(JSON.stringify(resolveLabelUrls(sortedLabels, result)));
      });
    };

    Chrome.get('ImportExport2', ['labels', 'previousLabels'], async (result) => {
      sortAndStuff(result.labels, (sorted) => setExportLabels(sorted));

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

  const saveImport = () => {
    if (!importLabels || !importLabels.length) return;

    try {
      Chrome.set('ImportExport1', buildImportUpdates(importLabels));
    } catch (e) {
      console.log("Error Importing", e);
    }
    if (onComplete) onComplete();
  }

  return (
    <div className="ImportExport">
      <button className="ImportExport-back" onClick={onComplete}>
        <Icon name="arrowLeft" size={15} /> Home
      </button>

      <h1 className="ImportExport-h1">Import / Export</h1>
      <p className="ImportExport-intro">
        Recover your tab information if a bug ever happens. Paste a saved snapshot
        into Import to restore your groups, or copy a snapshot below to keep a
        working backup.
      </p>

      <section className="ImportExport-group">
        <h2 className="ImportExport-eyebrow">Import</h2>
        <textarea
          className="ImportExport-box"
          value={importLabels}
          onChange={(e) => setImportLabels(e.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        />
        <button className="ImportExport-import-save" onClick={saveImport}>
          Import
        </button>
      </section>

      <section className="ImportExport-group">
        <h2 className="ImportExport-eyebrow">Export</h2>

        <h3 className="ImportExport-subhead">Current</h3>
        <textarea className="ImportExport-box" value={exportLabels} readOnly={true} />

        <h3 className="ImportExport-subhead">Previous (most recent first)</h3>
        {previousLabels.map((previous, index) => (
          <SnapshotField key={`previousLabels-${index}`} value={previous} />
        ))}
      </section>
    </div>
  );
}

export default ImportExport;
