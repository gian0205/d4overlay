'use strict';

/**
 * IDs numéricos que o GEP do Diablo IV envia no lugar de nomes.
 * Fonte: https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/diablo-4/
 * As tabelas de área/território ficam em data/gep/*.txt (baixadas da mesma página).
 */

/** Feature "me", key "class". O Warlock ainda não aparece na documentação. */
const CLASS_BY_GEP_ID = {
  176832: 'Barbarian Male',
  232657: 'Barbarian Female',
  338122: 'Druid Male',
  421560: 'Druid Female',
  430081: 'Necromancer Male',
  502576: 'Necromancer Female',
  486910: 'Rogue Male',
  223602: 'Rogue Female',
  220940: 'Sorcerer Male',
  72908: 'Sorcerer Female',
  1256872: 'Spiritborn Male',
  1241729: 'Spiritborn Female',
  2081670: 'Paladin Male',
  2131351: 'Paladin Female',
};

/** Lê linhas no formato `123 = "Nome"` e devolve Map<id, nome>. */
function parseIdList(text) {
  const map = new Map();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = line.match(/^\s*(-?\d+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && Number(m[1]) > 0) map.set(Number(m[1]), m[2].trim());
  }
  return map;
}

module.exports = { CLASS_BY_GEP_ID, parseIdList };
