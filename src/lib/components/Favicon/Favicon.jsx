import './Favicon.css';

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { faviconMonogram } from '../../utils/faviconMonogram';

// The favicon for a url row, with a graceful fallback: when a site has no
// favicon (or its image fails to load), a colored monogram tile stands in —
// a rounded square with the site's first letter, tinted deterministically per
// url so the same site always reads the same.
const Favicon = ({ favicon, urlKey, title }) => {
  const [faviconError, setFaviconError] = useState(false);

  // A new favicon source deserves a fresh attempt (the row's url resolves
  // asynchronously from storage), so clear any prior error.
  useEffect(() => {
    setFaviconError(false);
  }, [favicon]);

  if (favicon && !faviconError) {
    return (
      <img
        src={favicon}
        className="Url-favicon"
        alt=""
        onError={() => setFaviconError(true)}
      />
    );
  }

  const url = (urlKey || '').replace(/^url-/, '');
  const { text, color } = faviconMonogram(url, title);

  return (
    <span
      className="Url-favFallback"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
};

Favicon.propTypes = {
  favicon: PropTypes.string,
  urlKey: PropTypes.string,
  title: PropTypes.string
};

export default Favicon;
