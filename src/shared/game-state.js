'use strict';

const { classIdFrom } = require('./classes');

const DIABLO_IV_GAME_ID = 22700;

function emptyState() {
  return {
    running: false,
    character: { name: null, classId: null, rawClass: null, level: null, paragon: null },
    location: { area: null, areaId: null, territory: null, territoryId: null },
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

// getInfo agrupa por categoria ("character", "match_info"); os updates vêm por feature.
const ME = new Set(['me', 'character']);
const LOCATION_KEYS = new Set(['map', 'area', 'territory']);

/**
 * Aplica um info update do GEP (Diablo IV) ao estado.
 * Formato do update: { feature, category, key, value }.
 * Features do D4: "me" (categoria "character": name, class, level, paragon_level)
 * e "location" (categoria "match_info": key "map" = {"area": id, "territory": id};
 * key "location" são só coordenadas x/y/z).
 * Área e território chegam como IDs numéricos; os nomes vêm de `names`
 * ({ areas, territories }: Map<id, nome>), quando informado.
 * Retorna um novo objeto de estado (não muta o original).
 */
function applyInfoUpdate(state, update, names = {}) {
  const next = structuredClone(state);
  if (!update) return next;
  const key = update.key;
  const value = parseValue(update.value);

  if (ME.has(update.feature) || ME.has(update.category)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) {
        Object.assign(next, applyInfoUpdate(next, { feature: 'me', key: k, value: v }, names));
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

  if (update.feature === 'location' || update.category === 'location' || LOCATION_KEYS.has(key)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('area' in value) setPlace(next.location, 'area', value.area, names.areas);
      if ('territory' in value) setPlace(next.location, 'territory', value.territory, names.territories);
    } else if (key === 'area' || key === 'territory') {
      setPlace(next.location, key, value, key === 'area' ? names.areas : names.territories);
    }
  }

  return next;
}

/** Guarda o id bruto em `<campo>Id` e o nome (quando conhecido) em `<campo>`. */
function setPlace(location, field, raw, table) {
  const id = toNumber(raw);
  location[`${field}Id`] = id;
  location[field] = id === null ? raw : (table?.get(id) ?? null);
}

module.exports = { DIABLO_IV_GAME_ID, emptyState, applyInfoUpdate };
