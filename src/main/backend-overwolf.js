'use strict';

const { app, BrowserWindow } = require('electron');
const { DIABLO_IV_GAME_ID } = require('../shared/game-state');
const { HOTKEYS } = require('./hotkeys');
const { webPreferences, loadUi } = require('./windows');

const GEP_FEATURES = ['game_info', 'match_info', 'location', 'me'];
const OVERLAY_WINDOW_NAME = 'd4overlay-hud';

/**
 * Backend usando @overwolf/ow-electron:
 *  - pacote "overlay": injeta a janela dentro do jogo (funciona em tela cheia);
 *  - pacote "gep": eventos do jogo (classe, nível, área) do Diablo IV (id 22700).
 */
class OverwolfBackend {
  constructor(hub) {
    this.hub = hub;
    this.overlayApi = null;
    this.gepApi = null;
    this.overlayWindow = null;
    this.desktopWindow = null;
    this.interactive = false;
    this.visible = true;
  }

  start() {
    app.overwolf.packages.on('ready', (_e, name, version) => {
      console.log(`[overwolf] pacote pronto: ${name} ${version}`);
      if (name === 'overlay') this.setupOverlay();
      if (name === 'gep') this.setupGep();
    });
    app.overwolf.packages.on('failed-to-initialize', (_e, name) => {
      console.error(`[overwolf] falha ao inicializar pacote ${name}`);
    });
    this.openDesktopWindow();
  }

  /** Janela normal (fora do jogo) para escolher build e configurar. */
  openDesktopWindow() {
    if (this.desktopWindow && !this.desktopWindow.isDestroyed()) {
      this.desktopWindow.show();
      return;
    }
    this.desktopWindow = new BrowserWindow({
      width: 420,
      height: 720,
      title: 'D4 Overlay',
      webPreferences: webPreferences(),
    });
    loadUi(this.desktopWindow, 'desktop');
    this.hub.addWindow(this.desktopWindow);
  }

  setupOverlay() {
    this.overlayApi = app.overwolf.packages.overlay;
    this.overlayApi.registerGames({ gamesIds: [DIABLO_IV_GAME_ID] });

    this.overlayApi.on('game-launched', (event, gameInfo) => {
      if (gameInfo.processInfo?.isElevated) {
        console.warn('[overlay] Diablo IV rodando como admin: execute o app como admin para injetar.');
      }
      event.inject();
    });

    this.overlayApi.on('game-injected', async () => {
      try {
        await this.createOverlayWindow();
        this.desktopWindow?.minimize();
      } catch (err) {
        console.error('[overlay] erro ao criar janela in-game', err);
      }
    });

    this.overlayApi.on('game-injection-error', (gameInfo, error) => {
      console.error(`[overlay] erro de injeção em ${gameInfo?.name}: ${error}`);
    });

    this.overlayApi.on('game-exit', () => {
      this.overlayWindow = null;
      this.hub.setGameRunning(false);
    });

    for (const hotkey of HOTKEYS) {
      try {
        this.overlayApi.hotkeys.register(
          { name: hotkey.action, keyCode: hotkey.key, modifiers: { ctrl: true, shift: true } },
          (_hk, state) => {
            if (state === 'pressed') this.hub.onHotkey(hotkey.action);
          },
        );
      } catch (err) {
        console.error(`[overlay] falha ao registrar hotkey ${hotkey.label}`, err);
      }
    }
  }

  async createOverlayWindow() {
    const existing = this.overlayApi.getAllWindows().find((w) => w.name === OVERLAY_WINDOW_NAME);
    if (existing) return;

    const { bounds } = this.hub.settings.get();
    const gameSize = this.overlayApi.getActiveGameInfo()?.gameWindowInfo?.size;
    const x = bounds.x ?? (gameSize ? gameSize.width - bounds.width - 24 : 24);
    const y = bounds.y ?? 80;

    const overlayWindow = await this.overlayApi.createWindow({
      name: OVERLAY_WINDOW_NAME,
      width: bounds.width,
      height: bounds.height,
      x,
      y,
      show: true,
      transparent: true,
      frame: false,
      resizable: true,
      passthrough: 'passThrough',
      zOrder: 'topMost',
      webPreferences: webPreferences(),
    });
    this.overlayWindow = overlayWindow;
    this.interactive = false;
    await loadUi(overlayWindow.window, 'overlay');
    this.hub.addWindow(overlayWindow.window);

    overlayWindow.window.on('moved', () => this.saveBounds());
    overlayWindow.window.on('resized', () => this.saveBounds());
  }

  saveBounds() {
    const win = this.overlayWindow?.window;
    if (!win || win.isDestroyed()) return;
    const { x, y, width, height } = win.getBounds();
    this.hub.settings.update({ bounds: { x, y, width, height } });
  }

  setupGep() {
    this.gepApi = app.overwolf.packages.gep;

    this.gepApi.on('game-detected', async (event, gameId, name) => {
      if (gameId !== DIABLO_IV_GAME_ID) return;
      console.log(`[gep] jogo detectado: ${name}`);
      event.enable();
      this.hub.setGameRunning(true);
      await this.setRequiredFeatures();
    });

    this.gepApi.on('new-info-update', (_e, gameId, data) => {
      if (gameId === DIABLO_IV_GAME_ID) this.hub.onInfoUpdate(data);
    });

    this.gepApi.on('new-game-event', (_e, gameId, data) => {
      if (gameId === DIABLO_IV_GAME_ID) this.hub.onGameEvent(data);
    });

    this.gepApi.on('game-exit', (_e, gameId) => {
      if (gameId === DIABLO_IV_GAME_ID) this.hub.setGameRunning(false);
    });

    this.gepApi.on('error', (_e, gameId, error) => {
      console.error(`[gep] erro (${gameId}): ${error}`);
    });
  }

  /** O GEP pode recusar enquanto o jogo carrega; tenta algumas vezes. */
  async setRequiredFeatures(attempt = 1) {
    try {
      await this.gepApi.setRequiredFeatures(DIABLO_IV_GAME_ID, GEP_FEATURES);
      const info = await this.gepApi.getInfo(DIABLO_IV_GAME_ID);
      this.hub.onInitialInfo(info);
    } catch (err) {
      if (attempt >= 10) {
        console.error('[gep] não foi possível registrar features', err);
        return;
      }
      setTimeout(() => this.setRequiredFeatures(attempt + 1), 3000);
    }
  }

  setInteractive(value) {
    this.interactive = value;
    if (this.overlayWindow) {
      this.overlayWindow.overlayOptions.passthrough = value ? 'noPassThrough' : 'passThrough';
    }
    return this.interactive;
  }

  toggleVisible() {
    const win = this.overlayWindow?.window;
    if (!win || win.isDestroyed()) {
      this.openDesktopWindow();
      return;
    }
    this.visible = !this.visible;
    if (this.visible) win.show();
    else win.hide();
  }
}

module.exports = { OverwolfBackend };
