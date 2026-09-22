'use strict';

const { normalize } = require('./text');
const { CLASS_BY_GEP_ID } = require('./gep-ids');

/** Classes jogáveis do Diablo IV (ids usados nos arquivos de dados). */
const CLASSES = [
  { id: 'barbarian', name: 'Bárbaro' },
  { id: 'druid', name: 'Druida' },
  { id: 'necromancer', name: 'Necromante' },
  { id: 'rogue', name: 'Renegada' },
  { id: 'sorcerer', name: 'Feiticeiro' },
  { id: 'spiritborn', name: 'Espiritonato' },
  { id: 'paladin', name: 'Paladino' },
  { id: 'warlock', name: 'Warlock' },
];

const ALIASES = {
  barbarian: ['barbarian', 'barbaro', 'barb'],
  druid: ['druid', 'druida'],
  necromancer: ['necromancer', 'necromante', 'necro'],
  rogue: ['rogue', 'renegada', 'ladina'],
  sorcerer: ['sorcerer', 'sorceress', 'feiticeiro', 'feiticeira', 'sorc'],
  spiritborn: ['spiritborn', 'espiritonato', 'espirito nato'],
  paladin: ['paladin', 'paladino'],
  warlock: ['warlock', 'bruxo'],
};

/**
 * Converte o valor bruto vindo do GEP (ex.: "Barbarian_Female", "sorcerer")
 * no id interno da classe. Retorna null se não reconhecer.
 */
function classIdFrom(raw) {
  // O GEP manda um número (ex.: 220940 = "Sorcerer Male"); texto também é aceito.
  const named = CLASS_BY_GEP_ID[Number(raw)] ?? raw;
  const text = normalize(String(named ?? '').replace(/_/g, ' '));
  if (!text) return null;
  const words = text.split(' ');
  for (const [id, aliases] of Object.entries(ALIASES)) {
    if (aliases.some((a) => words.includes(a) || text === a)) return id;
  }
  return null;
}

function className(id) {
  return CLASSES.find((c) => c.id === id)?.name ?? id;
}

module.exports = { CLASSES, classIdFrom, className };
