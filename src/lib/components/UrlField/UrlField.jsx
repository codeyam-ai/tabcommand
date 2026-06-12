import React from 'react';

// A single labeled field in the UrlDetails edit form — an <input> (Title, Url,
// Favicon) or a <textarea> (Notes) when `multiline` is set. The onKeyDown
// stopPropagation guard is reproduced faithfully: it keeps the app's global
// Esc/Search key handlers from firing while the user is typing in the field.
// Layout is styled by the page's `.UrlDetails` scope when composed there.
const stopProp = (event) => event.stopPropagation();

const UrlField = ({ label, name, value, onChange, placeholder, multiline }) => {
  const className = `UrlDetails-form-${name}`;

  return (
    <p>
      <label>
        <span>{label}</span>
        {multiline ? (
          <textarea
            name={name}
            className={className}
            placeholder={placeholder}
            value={value}
            onKeyDown={stopProp}
            onChange={onChange}
          />
        ) : (
          <input
            type="text"
            name={name}
            className={className}
            placeholder={placeholder}
            value={value}
            onKeyDown={stopProp}
            onChange={onChange}
          />
        )}
      </label>
    </p>
  );
};

export default UrlField;
