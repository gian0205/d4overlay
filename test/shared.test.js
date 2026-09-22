'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { classIdFrom } = require('../src/shared/classes');
const { findBossByLocation, groupDrops } = require('../src/shared/boss-match');
const { currentPhase, nextStep, progress } = require('../src/shared/guide');
const { emptyState, applyInfoUpdate } = require('../src/shared/game-state');
const { validateData } = require('../src/shared/validate');
const { parseEvents } = require('../src/main/world-events');

const bosses = require(path.join(__dirname, '..', 'data', 'bosses.json'));
const builds = require(path.join(__dirname, '..', 'data', 'builds.json'));

test('dados empacotados são válidos', () => {
  assert.deepEqual(validateData({ bosses, builds }), []);
});

test('todas as classes têm ao menos um build', () => {
  const { CLASSES } = require('../src/shared/classes');
  for (const c of CLASSES) {
    assert.ok(builds.builds.some((b) => b.classId === c.id), `sem build para ${c.id}`);
  }
});

test('classIdFrom reconhece formatos do GEP', () => {
  assert.equal(classIdFrom('Barbarian_Female'), 'barbarian');
  assert.equal(classIdFrom('sorcerer'), 'sorcerer');
  assert.equal(classIdFrom('Spiritborn_Male'), 'spiritborn');
  assert.equal(classIdFrom('Paladin'), 'paladin');
  assert.equal(classIdFrom(''), null);
  assert.equal(classIdFrom('Amazon'), null);
  // formato real do GEP: número
  assert.equal(classIdFrom(220940), 'sorcerer');
  assert.equal(classIdFrom('2131351'), 'paladin');
  assert.equal(classIdFrom(-1), null);
});

test('formato real do GEP: class numérica e map com IDs de área', () => {
  const { parseIdList } = require('../src/shared/gep-ids');
  const fs = require('fs');
  const areas = parseIdList(fs.readFileSync(path.join(__dirname, '..', 'data', 'gep', 'area_names.txt'), 'utf8'));
  const territories = parseIdList(fs.readFileSync(path.join(__dirname, '..', 'data', 'gep', 'territory_names.txt'), 'utf8'));
  const names = { areas, territories };
  assert.equal(areas.get(1496133), 'Hall of the Penitent');
  assert.equal(areas.has(-1), false);

  // exemplos copiados da doc do Overwolf (feature/category/key/value)
  let s = emptyState();
  s = applyInfoUpdate(s, { feature: 'me', category: 'character', key: 'class', value: 220940 }, names);
  s = applyInfoUpdate(s, { feature: 'location', category: 'match_info', key: 'location', value: '{"x" : -1001.76,"y" : 133.699,"z" : 77.6396}' }, names);
  s = applyInfoUpdate(s, { feature: 'location', category: 'match_info', key: 'map', value: '{"area" : 1496133,"territory" : 1381479}' }, names);
  assert.equal(s.character.classId, 'sorcerer');
  assert.equal(s.location.areaId, 1496133);
  assert.equal(s.location.area, 'Hall of the Penitent');
  assert.equal(s.location.territory, 'Kurast');
  assert.equal(findBossByLocation(bosses.bosses, s.location)?.id, 'grigoire');

  // getInfo agrupa por categoria ("character", "match_info")
  let g = applyInfoUpdate(emptyState(), { feature: 'character', category: 'character', key: 'class', value: 2081670 }, names);
  g = applyInfoUpdate(g, { feature: 'match_info', category: 'match_info', key: 'map', value: '{"area" : 2189180,"territory" : 0}' }, names);
  assert.equal(g.character.classId, 'paladin');
  assert.equal(findBossByLocation(bosses.bosses, g.location)?.id, 'belial');

  // área fora da tabela: guarda o id, sem nome, sem boss
  const u = applyInfoUpdate(emptyState(), { feature: 'location', key: 'map', value: '{"area" : 999,"territory" : 1}' }, names);
  assert.equal(u.location.areaId, 999);
  assert.equal(u.location.area, null);
  assert.equal(findBossByLocation(bosses.bosses, u.location), null);
});

test('findBossByLocation acha a arena pelo nome da área', () => {
  const list = bosses.bosses;
  assert.equal(findBossByLocation(list, { area: 'Gaping Crevasse' })?.id, 'duriel');
  assert.equal(findBossByLocation(list, { area: "Hanged Man's Hall", territory: 'Kehjistan' })?.id, 'andariel');
  assert.equal(findBossByLocation(list, { area: 'Kyovashad' }), null);
  assert.equal(findBossByLocation(list, {}), null);
  assert.equal(findBossByLocation(list, null), null);
});

test('groupDrops separa drops da classe, compartilhados e outros', () => {
  const boss = { drops: [{ name: 'A', classes: ['barbarian'] }, { name: 'B' }, { name: 'C', classes: ['rogue'] }] };
  const g = groupDrops(boss, 'barbarian');
  assert.deepEqual(g.mine.map((d) => d.name), ['A']);
  assert.deepEqual(g.shared.map((d) => d.name), ['B']);
  assert.deepEqual(g.others.map((d) => d.name), ['C']);
});

test('currentPhase escolhe fase por nível e paragon', () => {
  const build = builds.builds[0];
  assert.equal(currentPhase(build, {}).id, 'lv1');
  assert.equal(currentPhase(build, { level: 10 }).id, 'lv1');
  assert.equal(currentPhase(build, { level: 30 }).id, 'lv2');
  assert.equal(currentPhase(build, { level: 55 }).id, 'lv3');
  assert.equal(currentPhase(build, { level: 70, paragon: 0 }).id, 'end1');
  assert.equal(currentPhase(build, { level: 70, paragon: 200 }).id, 'end2');
});

test('currentPhase ignora fases manuais e usa a primeira fase abaixo do nível máximo', () => {
  const build = {
    phases: [
      { id: 'push', manual: true, minParagon: 0 },
      { id: 'start', minParagon: 0 },
      { id: 'end', minParagon: 200 },
    ],
  };
  assert.equal(currentPhase(build, { level: 20 }).id, 'start');
  assert.equal(currentPhase(build, { level: 70, paragon: 10 }).id, 'start');
  assert.equal(currentPhase(build, { level: 70, paragon: 250 }).id, 'end');
  assert.equal(currentPhase({ phases: [{ id: 'só', manual: true }] }, {}).id, 'só');
});

test('nextStep e progress usam os passos concluídos', () => {
  const build = builds.builds[0];
  const phase = build.phases[0];
  assert.equal(nextStep(phase, []).id, phase.steps[0].id);
  assert.equal(nextStep(phase, [phase.steps[0].id]).id, phase.steps[1].id);
  assert.equal(progress(build, []), 0);
  const all = build.phases.flatMap((p) => p.steps.map((s) => s.id));
  assert.equal(progress(build, all), 100);
});

test('applyInfoUpdate processa features "me" e "location"', () => {
  let s = emptyState();
  s = applyInfoUpdate(s, { feature: 'me', category: 'me', key: 'class', value: 'Necromancer_Male' });
  s = applyInfoUpdate(s, { feature: 'me', category: 'me', key: 'level', value: '60' });
  s = applyInfoUpdate(s, { feature: 'me', category: 'me', key: 'paragon_level', value: 123 });
  s = applyInfoUpdate(s, { feature: 'location', category: 'location', key: 'area', value: 'Glacial Fissure' });
  assert.equal(s.character.classId, 'necromancer');
  assert.equal(s.character.level, 60);
  assert.equal(s.character.paragon, 123);
  assert.equal(s.location.area, 'Glacial Fissure');

  const obj = applyInfoUpdate(emptyState(), { feature: 'location', key: 'location', value: '{"area":"Darkened Way","territory":"Fractured Peaks"}' });
  assert.equal(obj.location.territory, 'Fractured Peaks');
});

test('parseEvents normaliza timestamps em segundos e ms', () => {
  const ev = parseEvents({ boss: { name: 'Ashava', zone: 'Fractured Peaks', expected: 1_900_000_000 }, helltide: { timestamp: 1_900_000_000_000 } });
  assert.equal(ev.worldBoss.name, 'Ashava');
  assert.equal(ev.worldBoss.at, 1_900_000_000_000);
  assert.equal(ev.helltide.at, 1_900_000_000_000);
  assert.equal(ev.legion, null);
  assert.equal(parseEvents(null), null);
});
