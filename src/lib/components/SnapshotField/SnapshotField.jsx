import './SnapshotField.css';

import React, { useEffect, useRef, useState } from 'react';

import { Icon } from '../Icon';
import { SnapshotBox } from '../SnapshotBox';

// A read-only snapshot with its own Copy button. The button writes the value to
// the clipboard and flips to a green "Copied ✓" for ~1.6s before reverting.
const SnapshotField = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    // `writeText` REJECTS when the clipboard is unavailable or permission is
    // denied — a headless capture, a hardened profile, a non-secure context.
    // Unhandled, that rejection surfaces as a page error on the one path this
    // feature tells users to take when their groups are not reaching sync:
    // copy the snapshot. Swallow it and still confirm, so the copy degrades to
    // "select the text yourself" rather than an error the user cannot act on.
    Promise.resolve(navigator.clipboard?.writeText(value)).catch(() => {});
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="SnapshotField">
      <SnapshotBox value={value} readOnly={true} />
      <button
        type="button"
        className={`SnapshotField-copy${copied ? ' is-copied' : ''}`}
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

export default SnapshotField;
