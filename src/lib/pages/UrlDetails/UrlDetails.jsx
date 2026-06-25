import './UrlDetails.css';

import React, { useEffect, useState } from 'react';
import { HomeFilled } from '@ant-design/icons';

import { Pages } from '../../../Constants';
import { Chrome } from '../../utils/Chrome';
import { UrlField, UrlLabel } from '../../components';
import { deriveUrlLabels, buildUrlInfo, removeUrlFromLabel } from '../../utils/urlDetails';

// The URL Details page: a full-screen form for editing one saved URL — its
// title/url/favicon, free-form notes, and its group (label) memberships.
// Navigation in already exists: the Url row's edit pencil writes
// uxSettings.page = { name: Pages.URL, urlKey }, which App propagates here.
// The form field, the Groups chip, and the pure logic are extracted into
// UrlField / UrlLabel / utils/urlDetails.
const UrlDetails = ({ urlKey }) => {
  const [{ url, title, favicon, notes, labels, urlLabels }, setState] = useState({
    url: urlKey.replace('url-', ''),
    title: '',
    favicon: '',
    notes: '',
    labels: {},
    urlLabels: []
  })

  // urlLabels is derived (not stored) from labels + urlKey whenever labels change.
  const setPartialState = (updates) => {
    if (Object.keys(updates).length === 0) return;

    if (updates.labels) {
      updates.urlLabels = deriveUrlLabels(updates.labels, urlKey);
    }

    setState(prevState => {
      return {
        ...prevState,
        ...updates
      }
    })
  }

  useEffect(() => {
    Chrome.get('UrlDetails1', [urlKey, 'labels'], result => {
      setPartialState({ ...result[urlKey], labels: result.labels });
    });
  }, []);

  const handleChange = (event) => {
    event.stopPropagation();
    const { name, value } = event.target;
    setPartialState({
      [name]: value
    });
  }

  const handleSubmit = (e) => {
    e.stopPropagation();
    e.preventDefault();

    Chrome.set('UrlDetails1', {
      [urlKey]: buildUrlInfo({ title, url, favicon, notes }),
      labels: labels
    });

    goHome();
  };

  const goHome = (e) => {
    if (e) e.stopPropagation();
    Chrome.get('UrlDetails2', 'uxSettings', ({uxSettings}) => {
      delete uxSettings.urlKey;
      uxSettings.page = { name: Pages.HOME };
      Chrome.set('UrlDetails2', { uxSettings: uxSettings });
    })
  }

  const handleLabelClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirm(`Are you sure you want to remove this url from the group, "${e.target.value}"?`)) {
      setPartialState({ labels: removeUrlFromLabel(labels, e.target.value, urlKey) });
    }
  }

  return (
    <div className="UrlDetails">
      <div className="UrlDetails-homeLink" onClick={goHome}>
        <HomeFilled /> Home
      </div>

      <h2 className='UrlDetails-title'>
        {title || url}
      </h2>

      <form className='UrlDetails-form' onSubmit={handleSubmit}>
        <UrlField label="Title" name="title" value={title} placeholder={title} onChange={handleChange} />
        <UrlField label="Url" name="url" value={url} placeholder={url} onChange={handleChange} />
        <UrlField label="Favicon" name="favicon" value={favicon} placeholder={favicon} onChange={handleChange} />
        <UrlField label="Notes" name="notes" value={notes} placeholder="Notes" onChange={handleChange} multiline />
        <p>
          <label>
            <span>Groups</span>
            {urlLabels.map((labelTitle) => (
              <UrlLabel key={`label-${labelTitle}`} title={labelTitle} onRemove={handleLabelClick} />
            ))}
          </label>
        </p>
        <input type="submit" className="UrlDetails-form-save" value="Save" />
        <span className='UrlDetails-form-cancel' onClick={goHome}>
          Cancel
        </span>
      </form>
    </div>
  );
}

export default UrlDetails;
