'use strict';

const { classIdFrom } = require('./classes');

const DIABLO_IV_GAME_ID = 22700;

function emptyState() {
  return {
    running: false,
    character: { name: null, classId: null, rawClass: null, level: null, paragon: null },
    location: { area: null, territory: null },
  };
}

/** Alguns valores do GEP chegam como JSON em string. */
function parseValue(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aplica um info update do GEP (Diablo IV) ao estado.
 * Formato do update: { feature, category, key, value }.
 * Features do D4: "me" (name, class, level, paragon_level, xp) e
 * "location" (area, territory, coordenadas).
 * Retorna um novo objeto de estado (não muta o original).
 */
function applyInfoUpdate(state, update) {
  const next = structuredClone(state);
  if (!update) return next;
  const key = update.key;
  const value = parseValue(update.value);

  if (update.feature === 'me' || update.category === 'me') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) {
        Object.assign(next, applyInfoUpdate(next, { feature: 'me', key: k, value: v }));
      }
      return next;
    }
    switch (key) {
      case 'name':
        next.character.name = value;
        break;
      case 'class':
        next.character.rawClass = value;
        next.character.classId = classIdFrom(value);
        break;
      case 'level':
        next.character.level = toNumber(value);
        break;
      case 'paragon_level':
        next.character.paragon = toNumber(value);
        break;
      default:
        break;
    }
  }

  if (update.feature === 'location' || update.category === 'location') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('area' in value) next.location.area = value.area;
      if ('territory' in value) next.location.territory = value.territory;
    } else if (key === 'area' || key === 'territory') {
      next.location[key] = value;
    }
  }

  return next;
}

module.exports = { DIABLO_IV_GAME_ID, emptyState, applyInfoUpdate };
