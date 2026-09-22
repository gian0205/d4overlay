'use strict';

const { app, ipcMain, shell, globalShortcut } = require('electron');
const { Settings } = require('./settings');
const { DataStore } = require('./data-store');
const { WorldEvents } = require('./world-events');
const { HOTKEYS } = require('./hotkeys');
const { emptyState, applyInfoUpdate } = require('../shared/game-state');
const { findBossByLocation } = require('../shared/boss-match');
const { parseIdList } = require('../shared/gep-ids');
const fs = require('fs');
const path = require('path');

/** Tabelas de IDs de área/território do GEP (data/gep, baixadas da doc do Overwolf). */
function loadGepNames() {
  const read = (file) => {
    try {
      return parseIdList(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'gep', file), 'utf8'));
    } catch {
      return new Map();
    }
  };
  return { areas: read('area_names.txt'), territories: read('territory_names.txt') };
}

/**
 * Hub central: guarda o estado do jogo e distribui para todas as janelas.
 * O backend (Overwolf ou Electron puro) só cuida de janelas, hotkeys e GEP.
 */
class Hub {
  constructor() {
    this.settings = new Settings(app.getPath('userData'));
    this.data = new DataStore(app.getPath('userData'));
    this.windows = new Set();
    this.gameState = emptyState();
    this.currentBossId = null;
    this.gepNames = loadGepNames();
    this.lastAreaId = null;
    this.worldEvents = null;
    this.backend = null;
  }

  addWindow(win) {
    this.windows.add(win);
    win.on('closed', () => this.windows.delete(win));
  }

  broadcast(channel, payload) {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }

  setGameRunning(running) {
    this.gameState = running ? { ...this.gameState, running: true } : emptyState();
    this.publishGameState();
  }

  onInitialInfo(info) {
    // getInfo retorna { me: {...}, location: {...}, ... } — aplica cada categoria
    for (const [category, values] of Object.entries(info?.res ?? info ?? {})) {
      if (!values || typeof values !== 'object') continue;
      for (const [key, value] of Object.entries(values)) {
        this.gameState = applyInfoUpdate(this.gameState, { feature: category, category, key, value }, this.gepNames);
      }
    }
    this.publishGameState();
  }

  onInfoUpdate(update) {
    this.gameState = applyInfoUpdate({ ...this.gameState, running: true }, update, this.gepNames);
    this.publishGameState();
  }

  onGameEvent(event) {
    this.broadcast('game-event', event);
  }

  publishGameState() {
    this.broadcast('game-state', this.gameState);

    // Ajuda a calibrar arena.matchers: mostra no console cada área nova que o GEP envia.
    const loc = this.gameState.location;
    if (loc.areaId !== this.lastAreaId) {
      this.lastAreaId = loc.areaId;
      console.log(`[gep] área: ${loc.areaId} = ${loc.area ?? '(sem nome na tabela)'} · território: ${loc.territoryId} = ${loc.territory ?? '?'} · classe: ${this.gameState.character.rawClass}`);
    }

    const boss = findBossByLocation(this.data.get().bosses.bosses, this.gameState.location);
    const bossId = boss?.id ?? null;
    if (bossId !== this.currentBossId) {
      this.currentBossId = bossId;
      this.broadcast('boss-detected', bossId);
    }
  }

  onHotkey(action) {
    if (action === 'toggle-interactive') {
      const value = this.backend.setInteractive(!this.backend.interactive);
      this.broadcast('interactive', value);
    } else if (action === 'toggle-visible') {
      this.backend.toggleVisible();
    } else {
      this.broadcast('hotkey', action);
    }
  }

  registerIpc() {
    ipcMain.handle('get-bootstrap', () => ({
      data: this.data.get(),
      settings: this.settings.get(),
      gameState: this.gameState,
      bossId: this.currentBossId,
      interactive: this.backend.interactive,
      hotkeys: HOTKEYS,
      worldEvents: this.lastWorldEvents ?? null,
      overwolf: Boolean(app.overwolf),
    }));
    ipcMain.handle('update-settings', (_e, patch) => {
      const next = this.settings.update(patch);
      if ('worldEventsUrl' in patch) this.worldEvents.start(next.worldEventsUrl);
      return next;
    });
    ipcMain.handle('toggle-step', (_e, buildId, stepId) => this.settings.toggleStep(buildId, stepId));
    ipcMain.handle('refresh-data', async () => {
      const result = await this.data.refreshFromRemote(this.settings.get().remoteDataUrl);
      if (result.ok) this.broadcast('data', this.data.get());
      return result;
    });
    ipcMain.handle('import-maxroll', async (_e, input) => {
      const result = await this.data.importMaxroll(input);
      if (result.ok) this.broadcast('data', this.data.get());
      return result;
    });
    ipcMain.handle('remove-imported-build', (_e, buildId) => {
      this.data.removeImported(buildId);
      if (this.settings.get().selectedBuildId === buildId) this.settings.update({ selectedBuildId: null });
      this.broadcast('data', this.data.get());
      return this.settings.get();
    });
    ipcMain.handle('set-interactive', (_e, value) => {
      const next = this.backend.setInteractive(Boolean(value));
      this.broadcast('interactive', next);
      return next;
    });
    ipcMain.handle('open-external', (_e, url) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    });
  }

  start() {
    const { OverwolfBackend } = require('./backend-overwolf');
    const { FallbackBackend } = require('./backend-fallback');
    this.backend = app.overwolf ? new OverwolfBackend(this) : new FallbackBackend(this);
    console.log(`[d4overlay] modo: ${app.overwolf ? 'ow-electron (overlay in-game + GEP)' : 'electron (janela sempre no topo)'}`);

    this.registerIpc();
    this.backend.start();

    this.worldEvents = new WorldEvents((payload) => {
      this.lastWorldEvents = payload;
      this.broadcast('world-events', payload);
    });
    this.worldEvents.start(this.settings.get().worldEventsUrl);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const hub = new Hub();
  app.whenReady().then(() => hub.start());
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
