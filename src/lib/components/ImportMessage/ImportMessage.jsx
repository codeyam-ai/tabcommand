import './ImportMessage.css';

import React from 'react';

import { Icon } from '../Icon';

// What happened to the snapshot the user just pasted.
//
// Two tones rather than two components: an import that failed and an import
// that succeeded-but-was-repaired are the same obligation wearing different
// colors — say what happened, in the same place, in the same shape. They differ
// only in icon, accent, and which live region announces them: a failure is an
// `alert` because the user must act on it, a repair report is a `status`
// because it is an account of something already done.
//
// Renders nothing without a message, so a caller can pass its state straight
// through without guarding.
const ImportMessage = ({ tone = 'error', children }) => {
  if (!children) return null;

  const isError = tone === 'error';

  return (
    <p
      className={`ImportMessage ImportMessage--${isError ? 'error' : 'notice'}`}
      role={isError ? 'alert' : 'status'}
    >
      <Icon name={isError ? 'info' : 'check'} size={14} /> {children}
    </p>
  );
};

export default ImportMessage;
