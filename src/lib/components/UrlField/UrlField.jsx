import './UrlField.css';

import React from 'react';

// A single labeled field in the UrlDetails edit form — an <input> (Title, Url,
// Favicon) or a <textarea> (Notes) when `multiline` is set. `mono` renders the
// value in the monospace face (used for Url / Favicon / Notes). The onKeyDown
// stopPropagation guard keeps the app's global Esc/Search key handlers from
// firing while the user is typing in the field.
const stopProp = (event) => event.stopPropagation();

const UrlField = ({ label, name, value, onChange, placeholder, multiline, mono }) => {
  // Keep the name-derived class (queried by tests + the page) and add the
  // restyled wrapper classes for the CodeYam look.
  const fieldClass = `UrlField-control${mono ? ' UrlField-control--mono' : ''} UrlDetails-form-${name}`;

  return (
    <label className="UrlField">
      <span className="UrlField-label">{label}</span>
      {multiline ? (
        <textarea
          name={name}
          className={`${fieldClass} UrlField-textarea`}
          placeholder={placeholder}
          value={value}
          onKeyDown={stopProp}
          onChange={onChange}
        />
      ) : (
        <input
          type="text"
          name={name}
          className={fieldClass}
          placeholder={placeholder}
          value={value}
          onKeyDown={stopProp}
          onChange={onChange}
        />
      )}
    </label>
  );
};

export default UrlField;
