'use strict';

const { normalize } = require('./text');

/**
 * Encontra o boss cuja arena corresponde à localização atual do jogador.
 * `location` vem do GEP do Overwolf (feature "location": area / territory).
 * Cada boss tem `arena.matchers`: trechos de nome de área que identificam a arena.
 */
function findBossByLocation(bosses, location) {
  if (!location) return null;
  const haystacks = [location.area, location.territory]
    .map(normalize)
    .filter(Boolean);
  if (haystacks.length === 0) return null;

  for (const boss of bosses) {
    const matchers = (boss.arena?.matchers ?? []).map(normalize).filter(Boolean);
    if (matchers.some((m) => haystacks.some((h) => h.includes(m)))) return boss;
  }
  return null;
}

/**
 * Agrupa os drops de um boss para exibição: primeiro os da classe atual,
 * depois os genéricos (sem classe), depois os das outras classes.
 */
function groupDrops(boss, classId) {
  const drops = boss?.drops ?? [];
  const mine = [];
  const shared = [];
  const others = [];
  for (const drop of drops) {
    const classes = drop.classes ?? [];
    if (classes.length === 0) shared.push(drop);
    else if (classId && classes.includes(classId)) mine.push(drop);
    else others.push(drop);
  }
  return { mine, shared, others };
}

module.exports = { findBossByLocation, groupDrops };
