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
  assert.equal(currentPhase(build, { level: 60, paragon: 0 }).id, 'end1');
  assert.equal(currentPhase(build, { level: 60, paragon: 200 }).id, 'end2');
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
