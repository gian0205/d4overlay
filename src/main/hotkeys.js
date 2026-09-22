'use strict';

/**
 * Atalhos globais. `key` usa KeyboardEvent.code (formato aceito pelo
 * overlay do ow-electron) e é convertido para accelerator do Electron.
 * Ctrl+Shift evita conflito com o Alt (destaque de itens) do Diablo IV.
 */
const HOTKEYS = [
  { action: 'toggle-interactive', key: 'KeyO', label: 'Ctrl+Shift+O', description: 'Interagir com o overlay (liberar mouse)' },
  { action: 'show-boss', key: 'KeyB', label: 'Ctrl+Shift+B', description: 'Aba de bosses' },
  { action: 'show-build', key: 'KeyG', label: 'Ctrl+Shift+G', description: 'Aba do guia de build' },
  { action: 'toggle-visible', key: 'KeyH', label: 'Ctrl+Shift+H', description: 'Mostrar/ocultar overlay' },
];

function toAccelerator(hotkey) {
  return `CommandOrControl+Shift+${hotkey.key.replace(/^Key/, '')}`;
}

module.exports = { HOTKEYS, toAccelerator };
