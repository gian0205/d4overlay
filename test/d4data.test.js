'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../scripts/d4data/lib');
const { enrichBosses, catalogWarnings } = require('../src/shared/catalog');

test('classesFromMask segue a ordem do jogo e trata "todas" como genérico', () => {
  assert.deepEqual(lib.classesFromMask([1, 0, 0, 0, 0, 0, 0, 0]), ['sorcerer']);
  assert.deepEqual(lib.classesFromMask([0, 0, 1, 0, 0, 0, 0, 0]), ['barbarian']);
  assert.deepEqual(lib.classesFromMask([0, 0, 0, 0, 0, 0, 0, 1]), ['warlock']);
  assert.deepEqual(lib.classesFromMask([1, 1, 1, 1, 1, 1, 1, 1]), []);
  assert.deepEqual(lib.classesFromMask(undefined), []);
});

test('cleanGameText remove marcação e escolhe o ramo não-mítico', () => {
  const raw =
    '{if:SF.IsMythic}{c_mythic}{/if}{c_important}Whirlwind{/c} deals {if:SF.IsMythic}{c_number}{else}{c_random}{/if}[Affix_Value_1*100|%|]{/c} more to {c_important}{u}Healthy{/u}{/c} enemies.{if:SF.IsMythic}{/c_mythic}{/if}';
  assert.equal(lib.cleanGameText(raw), 'Whirlwind deals #% more to Healthy enemies.');
  assert.equal(lib.cleanGameText('{icon:bullet,1.2} A {payload:X} B\r\n\r\n\r\nC'), 'A # B\n\nC');
  // plural do jogo e fórmula sem %
  assert.equal(lib.cleanGameText('by [Affix_Value_2] for [Affix_Value_3] |4second:seconds;.'), 'by # for # seconds.');
  assert.equal(lib.cleanGameText('up to [X|%|] chance, # |1Stack:Stacks; max'), 'up to #% chance, # Stacks max');
  // condicional órfão no fim (texto real de Henri's Perquisition) não vira "#"
  assert.equal(
    lib.cleanGameText('{if:SF.IsMythic}{c_mythic}{/if}You gain Primary Stat equal to {if:SF.IsMythic}{c_number}{else}{c_random}{/if}[Affix_Value_1|0%x|]{/c} of your {c_important}Dexterity{/c}.{/c_mythic}{/if}'),
    'You gain Primary Stat equal to #% of your Dexterity.',
  );
  assert.equal(lib.cleanGameText(undefined), '');
});

const item = (overrides = {}) => ({
  snoItemType: { name: 'Gloves' },
  fUsableByClass: [0, 0, 1, 0, 0, 0, 0, 0],
  eMagicType: 2,
  ...overrides,
});

test('buildUnique monta a entrada e descarta placeholders e variantes', () => {
  const u = lib.buildUnique({
    id: 'Gloves_Unique_Barb_001',
    item: item(),
    nameStrings: { Name: "Gohr's Devastating Grips", Flavor: 'x' },
    affixStrings: { Desc: '{c_important}Whirlwind{/c} explodes.' },
  });
  assert.equal(u.name, "Gohr's Devastating Grips");
  assert.deepEqual(u.classes, ['barbarian']);
  assert.equal(u.slotPt, 'Luvas');
  assert.equal(u.power, 'Whirlwind explodes.');
  assert.equal(u.mythic, false);

  const base = { item: item(), affixStrings: { Desc: 'x' } };
  assert.equal(lib.buildUnique({ ...base, id: 'Gloves_Unique_Druid_98', nameStrings: { Name: '[PH] Gloves' } }), null);
  assert.equal(lib.buildUnique({ ...base, id: 'S10_Ring_Unique_Barb_101_Helm', nameStrings: { Name: 'Ring' } }), null);
  assert.equal(lib.buildUnique({ ...base, id: 'Talisman_Charm_Unique_X', nameStrings: { Name: 'Ring' } }), null);
  assert.equal(lib.buildUnique({ ...base, id: 'X', item: item({ snoItemType: { name: 'Fish' } }), nameStrings: { Name: 'Fish' } }), null);
  assert.equal(lib.buildUnique({ ...base, id: 'X', nameStrings: { Name: 'Sem poder' }, affixStrings: null }), null);

  const mythic = lib.buildUnique({ ...base, id: 'Helm_Unique_Generic_002', item: item({ eMagicType: 4, snoItemType: { name: 'Helm' } }), nameStrings: { Name: 'Harlequin Crest' } });
  assert.equal(mythic.mythic, true);
});

test('powerAffixNames tenta o id e depois os affixes forçados', () => {
  const names = lib.powerAffixNames('S05_BSK_2HStaff_Unique_Druid_001', { arForcedAffixes: [{ name: 'S05_BSK_Druid_001' }, null] });
  assert.deepEqual(names, ['S05_BSK_2HStaff_Unique_Druid_001', 'S05_BSK_Druid_001']);
});

test('dedupeUniques junta variantes com o mesmo nome', () => {
  const list = lib.dedupeUniques([
    { name: 'B', classes: ['rogue'], mythic: false },
    { name: 'A', classes: [], mythic: false },
    { name: 'B', classes: ['necromancer'], mythic: true },
  ]);
  assert.deepEqual(list.map((u) => u.name), ['A', 'B']);
  assert.deepEqual(list[1].classes, ['rogue', 'necromancer']);
  assert.equal(list[1].mythic, true);
});

test('buildSkills usa os nomes do StringList e ignora duplicados', () => {
  const kit = { arActiveSkillEntries: [{ snoPower: { name: 'P1' } }, { snoPower: { name: 'P1' } }, { snoPower: { name: 'P2' } }] };
  const strings = { P1: { name: 'Ball Lightning', desc: '{c_number}5{/c} dmg' }, P2: null };
  assert.deepEqual(lib.buildSkills(kit, (id) => strings[id]), [{ id: 'P1', name: 'Ball Lightning', description: '5 dmg' }]);
});

const catalog = {
  uniques: [{ name: "Gohr's Devastating Grips", classes: ['barbarian'], slot: 'Gloves', slotPt: 'Luvas', power: 'boom', mythic: false }],
  skills: { barbarian: [{ name: 'Whirlwind' }] },
};

test('enrichBosses completa classe, slot e poder pelo nome (sem diferenciar acento/caixa)', () => {
  const out = enrichBosses({ bosses: [{ id: 'g', drops: [{ name: "gohr's devastating grips" }, { name: 'Inexistente' }] }] }, catalog.uniques);
  const [known, unknown] = out.bosses[0].drops;
  assert.equal(known.name, "Gohr's Devastating Grips");
  assert.deepEqual(known.classes, ['barbarian']);
  assert.equal(known.slot, 'Luvas');
  assert.equal(known.power, 'boom');
  assert.equal(unknown.inCatalog, false);
});

test('catalogWarnings aponta drops e skills desconhecidos', () => {
  const warnings = catalogWarnings(
    {
      bosses: { bosses: [{ id: 'g', drops: [{ name: 'Inexistente' }] }] },
      builds: { builds: [{ id: 'b', classId: 'barbarian', skills: [{ name: 'Whirlwind' }, { name: 'Voar' }] }] },
    },
    catalog,
  );
  assert.equal(warnings.length, 2);
});
