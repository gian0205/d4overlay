'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const guide = require('../shared/guide');
const bossMatch = require('../shared/boss-match');
const classes = require('../shared/classes');

function subscribe(channel) {
  return (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('d4', {
  bootstrap: () => ipcRenderer.invoke('get-bootstrap'),
  updateSettings: (patch) => ipcRenderer.invoke('update-settings', patch),
  toggleStep: (buildId, stepId) => ipcRenderer.invoke('toggle-step', buildId, stepId),
  refreshData: () => ipcRenderer.invoke('refresh-data'),
  setInteractive: (value) => ipcRenderer.invoke('set-interactive', value),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  onGameState: subscribe('game-state'),
  onBossDetected: subscribe('boss-detected'),
  onHotkey: subscribe('hotkey'),
  onInteractive: subscribe('interactive'),
  onWorldEvents: subscribe('world-events'),
  onData: subscribe('data'),

  logic: {
    currentPhase: guide.currentPhase,
    nextStep: guide.nextStep,
    progress: guide.progress,
    groupDrops: bossMatch.groupDrops,
    className: classes.className,
    classes: classes.CLASSES,
  },
});
