'use strict';

const { CLASSES } = require('./classes');

const CLASS_IDS = new Set(CLASSES.map((c) => c.id));

/** Valida os arquivos de dados. Retorna lista de erros (vazia se ok). */
function validateData({ bosses, builds }) {
  const errors = [];

  if (!Array.isArray(bosses?.bosses)) errors.push('bosses.json: campo "bosses" deve ser uma lista');
  if (!Array.isArray(builds?.builds)) errors.push('builds.json: campo "builds" deve ser uma lista');
  if (errors.length) return errors;

  const bossIds = new Set();
  for (const boss of bosses.bosses) {
    const where = `boss "${boss.id}"`;
    if (!boss.id || !boss.name) errors.push(`${where}: id e name são obrigatórios`);
    if (bossIds.has(boss.id)) errors.push(`${where}: id duplicado`);
    bossIds.add(boss.id);
    for (const drop of boss.drops ?? []) {
      if (!drop.name) errors.push(`${where}: drop sem name`);
      for (const c of drop.classes ?? []) {
        if (!CLASS_IDS.has(c)) errors.push(`${where}: classe desconhecida "${c}" em ${drop.name}`);
      }
    }
  }

  const buildIds = new Set();
  for (const build of builds.builds) {
    const where = `build "${build.id}"`;
    if (!build.id || !build.name) errors.push(`${where}: id e name são obrigatórios`);
    if (buildIds.has(build.id)) errors.push(`${where}: id duplicado`);
    buildIds.add(build.id);
    if (!CLASS_IDS.has(build.classId)) errors.push(`${where}: classId inválido "${build.classId}"`);
    const stepIds = new Set();
    for (const phase of build.phases ?? []) {
      for (const step of phase.steps ?? []) {
        if (!step.id || !step.text) errors.push(`${where}: passo sem id/text na fase "${phase.name}"`);
        if (stepIds.has(step.id)) errors.push(`${where}: passo com id duplicado "${step.id}"`);
        stepIds.add(step.id);
      }
    }
  }

  return errors;
}

module.exports = { validateData };
