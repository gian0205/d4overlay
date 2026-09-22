'use strict';

const { normalize } = require('./text');

/**
 * Catálogo gerado a partir dos arquivos do jogo (scripts/d4data).
 * Serve para completar os drops cadastrados em data/bosses.json com
 * classe, tipo de item, poder e se é Mítico.
 */
function indexUniques(uniques = []) {
  return new Map(uniques.map((u) => [normalize(u.name), u]));
}

function enrichDrop(drop, index) {
  const unique = index.get(normalize(drop.name));
  if (!unique) return { ...drop, inCatalog: false };
  return {
    ...drop,
    name: unique.name,
    classes: drop.classes ?? unique.classes,
    slot: unique.slotPt ?? unique.slot,
    power: unique.power,
    mythic: unique.mythic,
    inCatalog: true,
  };
}

/** Retorna uma cópia de bosses.json com os drops enriquecidos. */
function enrichBosses(bossesData, uniques) {
  if (!bossesData || !uniques?.length) return bossesData;
  const index = indexUniques(uniques);
  return {
    ...bossesData,
    bosses: bossesData.bosses.map((boss) => ({
      ...boss,
      drops: (boss.drops ?? []).map((drop) => enrichDrop(drop, index)),
    })),
  };
}

/** Avisos (não erros): drops e skills que não existem nos dados do jogo. */
function catalogWarnings({ bosses, builds }, { uniques, skills }) {
  const warnings = [];
  if (uniques?.length) {
    const index = indexUniques(uniques);
    for (const boss of bosses?.bosses ?? []) {
      for (const drop of boss.drops ?? []) {
        if (!index.has(normalize(drop.name))) {
          warnings.push(`boss "${boss.id}": "${drop.name}" não existe no catálogo de únicos`);
        }
      }
    }
  }
  if (skills) {
    for (const build of builds?.builds ?? []) {
      const known = new Set((skills[build.classId] ?? []).map((s) => normalize(s.name)));
      if (!known.size) continue;
      for (const skill of build.skills ?? []) {
        if (!known.has(normalize(skill.name))) {
          warnings.push(`build "${build.id}": skill "${skill.name}" não existe para ${build.classId}`);
        }
      }
    }
  }
  return warnings;
}

module.exports = { indexUniques, enrichBosses, catalogWarnings };
