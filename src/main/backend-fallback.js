'use strict';

const { BrowserWindow, globalShortcut, screen } = require('electron');
const { HOTKEYS, toAccelerator } = require('./hotkeys');
const { webPreferences, loadUi } = require('./windows');

/**
 * Backend com Electron puro: janela transparente "sempre no topo".
 * Só aparece sobre o jogo em modo "Tela cheia em janela" (borderless),
 * e não recebe dados do jogo (classe/nível/área são informados manualmente).
 */
class FallbackBackend {
  constructor(hub) {
    this.hub = hub;
    this.window = null;
    this.interactive = true;
  }

  start() {
    const { bounds } = this.hub.settings.get();
    const area = screen.getPrimaryDisplay().workArea;
    this.window = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x ?? area.x + area.width - bounds.width - 24,
      y: bounds.y ?? area.y + 80,
      transparent: true,
      frame: false,
      resizable: true,
      skipTaskbar: false,
      alwaysOnTop: true,
      webPreferences: webPreferences(),
    });
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    loadUi(this.window, 'overlay');
    this.hub.addWindow(this.window);

    const save = () => {
      const { x, y, width, height } = this.window.getBounds();
      this.hub.settings.update({ bounds: { x, y, width, height } });
    };
    this.window.on('moved', save);
    this.window.on('resized', save);

    for (const hotkey of HOTKEYS) {
      const ok = globalShortcut.register(toAccelerator(hotkey), () => this.hub.onHotkey(hotkey.action));
      if (!ok) console.warn(`[fallback] atalho ${hotkey.label} já está em uso`);
    }
  }

  setInteractive(value) {
    this.interactive = value;
    // não interativo: cliques atravessam a janela e vão para o jogo
    this.window.setIgnoreMouseEvents(!value, { forward: true });
    this.window.setFocusable(value);
    if (value) this.window.focus();
    return this.interactive;
  }

  toggleVisible() {
    if (this.window.isVisible()) this.window.hide();
    else this.window.showInactive();
  }
}

module.exports = { FallbackBackend };
