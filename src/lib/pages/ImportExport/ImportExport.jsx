import './ImportExport.css';

import React, { useEffect, useState } from 'react';

import { HomeFilled } from '@ant-design/icons';

import { Pages } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import {
  sortLabels,
  collectUrlKeys,
  resolveLabelUrls,
  buildImportUpdates,
} from '../../utils/importExport';

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

  const goHome = (e) => {
    e.stopPropagation();
    Chrome.get('ImportExport3', 'uxSettings', ({ uxSettings }) => {
      uxSettings.page = { name: Pages.HOME };
      Chrome.set('ImportExport2', { uxSettings: uxSettings });
    })
  }

  return (
    <div className="ImportExport">
      <div className="ImportExport-homeLink" onClick={goHome}>
        <HomeFilled /> Go To Homepage
      </div>
      <div className="ImportExport-description">
        <p>
          This page allows you to recover your tab information if a bug ever happens.
        </p>
        <p>
          Simply take the value from one of the &#34;Previous&#34; fields and paste it into the &#34;Import&#34;
          <br/>
          area to restore your tab information from before the bug.
        </p>
        <p>
          You may also want to save the working copy to a file in case the bug happens again.
        </p>
      </div>
      <div className="ImportExport-import">
        <h3>Import Groups</h3>
        <textarea
          value={importLabels}
          onChange={(e) => setImportLabels(e.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        />
        <button className='ImportExport-import-save' onClick={saveImport}>
          Import
        </button>
      </div>
      <div className="ImportExport-export">
        <h3>Export Groups</h3>

        <h4>Current</h4>
        <textarea value={exportLabels} readOnly={true}/>

        <h4 className='ImportExport-previous-all'>Previous (most recent first)</h4>
        {previousLabels.map((previous, index) => (
          <div key={`previousLabels-${index}`} className="ImportExport-previous">
            <textarea value={previous} readOnly={true}/>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ImportExport;
