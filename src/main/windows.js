'use strict';

const path = require('path');

const PRELOAD = path.join(__dirname, 'preload.js');
const INDEX = path.join(__dirname, '..', 'renderer', 'index.html');

function webPreferences() {
  return {
    preload: PRELOAD,
    contextIsolation: true,
    nodeIntegration: false,
    // o preload carrega os módulos de src/shared via require
    sandbox: false,
  };
}

function loadUi(win, mode) {
  return win.loadFile(INDEX, { query: { mode } });
}

module.exports = { webPreferences, loadUi };
