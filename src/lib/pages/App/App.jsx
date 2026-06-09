import './App.css';

import React from 'react';

import logo from '../../../images/logo.svg';

const App = () => {
  return (
    <div className="App">
      <div className="App-sidebar">
        <img src={logo} className="App-logo" alt="TabCommand" />
      </div>
      <div className="App-content">
        <div className="App-placeholder">
          TabCommand — modern rebuild in progress
        </div>
      </div>
    </div>
  );
};

export default App;
