'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { parsePlannerId, prettifyId, classifyProfile, convertPlannerBuild } = require('../src/shared/maxroll');
const { currentPhase } = require('../src/shared/guide');
const { validateData } = require('../src/shared/validate');
const { aspectFullName, buildCompanionData, uniqueIds } = require('../scripts/d4companion/lib');

// Mesmo formato de https://planners.maxroll.gg/profiles/d4/<id> (valores reduzidos).
function plannerFixture() {
  const profile = (name, skillBar, items, level = 70) => ({
    name,
    class: 'Paladin',
    level,
    items,
    skillBar,
    paragon: { steps: [{ name: 'x', data: [{ id: 'Paragon_Paladin_00', glyph: 'Rare_001_Intelligence_Main', nodes: {} }] }] },
  });
  return {
    id: 'abc123xy',
    name: 'Teste Paladino',
    class: 'Paladin',
    season: 15,
    date: '2026-09-20 10:00:00',
    user: { username: 'autor' },
    data: JSON.stringify({
      profiles: [
        profile('1-70 Leveling', ['Paladin_BlessedShield'], { 4: 1 }),
        profile('Starter', ['Paladin_BlessedShield', 'Paladin_Unknown_Thing'], { 4: 1, 5: 2 }),
        profile('Endgame', ['Paladin_BlessedShield'], { 4: 1, 5: 2, 16: 3, 21: 4, 20: 5, 22: 6, 23: 7 }),
        profile('Pit Push', ['Paladin_BlessedShield'], { 4: 1 }),
      ],
      items: {
        1: { id: 'Helm_Legendary_Generic_053', aspects: [{ nid: 2617264, values: [30] }], sockets: ['Rune_Condition_OnMove'] },
        2: { id: 'Chest_Unique_Paladin_001', aspects: [], sockets: [] },
        3: { id: 'Ring_Unique_Generic_099', aspects: [], sockets: [] },
        4: { id: 'Talisman_Charm_Unique_Chest_Unique_Paladin_001', aspects: [], sockets: [] },
        5: { id: 'Talisman_Seal_Legendary', name: 'Dire Spine' },
        6: { id: 'Talisman_Charm_Set_Pala_01_05', name: 'Dire Brand' },
        7: { id: 'Talisman_Charm_Set_Pala_01_04', name: "Lord's Vow" },
      },
    }),
  };
}

const sources = {
  skills: { paladin: [{ id: 'Paladin_BlessedShield', name: 'Blessed Shield' }] },
  uniques: [
    { id: 'Chest_Unique_Paladin_001', name: 'Mantle of the Grey', mythic: false, power: 'EN power' },
    { id: 'Ring_Unique_Generic_099', name: 'Ring of Starless Skies', mythic: true, power: 'mythic' },
  ],
  companion: {
    uniques: { Chest_Unique_Paladin_001: { name: 'Mantle of the Grey', namePt: 'Manto do Cinzento', powerPt: 'poder PT' } },
    aspects: { 2617264: { name: "Bulwark's Aspect", namePt: 'Aspecto do Baluarte', power: 'p', powerPt: 'pp', codex: true, dungeon: null } },
    runes: { Item_Rune_Condition_OnMove: { name: 'Bac' } },
    paragonBoards: { Paragon_Paladin_00: { name: 'Start', namePt: 'Iniciar' } },
    paragonGlyphs: { Rare_001_Intelligence_Main: { name: 'Enchanter', namePt: 'Encantador' } },
  },
  bosses: {
    bosses: [{ id: 'harbinger-of-hatred', name: 'Harbinger of Hatred', drops: [{ name: 'Mantle of the Grey' }] }],
    iconicMythics: ['Ring of Starless Skies'],
  },
};

test('parsePlannerId aceita link ou id', () => {
  assert.equal(parsePlannerId('https://maxroll.gg/d4/planner/fciqow0w'), 'fciqow0w');
  assert.equal(parsePlannerId('maxroll.gg/d4/planner/FCIQOW0W#2'), 'fciqow0w');
  assert.equal(parsePlannerId('https://planners.maxroll.gg/profiles/d4/dqih026y'), 'dqih026y');
  assert.equal(parsePlannerId(' fciqow0w '), 'fciqow0w');
  assert.equal(parsePlannerId('https://maxroll.gg/d4/build-guides/zeal-paladin-guide'), null);
  assert.equal(parsePlannerId(''), null);
});

test('prettifyId e classifyProfile', () => {
  assert.equal(prettifyId('Paladin_BlessedShield'), 'Blessed Shield');
  assert.equal(classifyProfile('1-70 Leveling').role, 'leveling');
  assert.equal(classifyProfile('Starter (Level 50)').role, 'leveling');
  assert.deepEqual(classifyProfile('Starter'), { role: 'progress', paragon: 0 });
  assert.deepEqual(classifyProfile('Midgame'), { role: 'progress', paragon: 100 });
  assert.deepEqual(classifyProfile('Endgame & The Pit'), { role: 'progress', paragon: 200 });
  assert.equal(classifyProfile('Tower Push').role, 'variant');
  assert.equal(classifyProfile('Speedfarming').role, 'variant');
});

test('convertPlannerBuild monta fases, checklist e equipamento', () => {
  const build = convertPlannerBuild(plannerFixture(), sources);
  assert.equal(build.id, 'maxroll-abc123xy');
  assert.equal(build.classId, 'paladin');
  assert.match(build.playstyle, /por autor · Temporada 15 · atualizado em 2026-09-20/);
  assert.deepEqual(validateData({ bosses: { bosses: [] }, builds: { builds: [build] } }), []);

  const [lv, starter, end, push] = build.phases;
  assert.deepEqual([lv.minLevel, lv.maxLevel], [1, 69]);
  assert.equal(starter.minParagon, 0);
  assert.equal(end.minParagon, 200);
  assert.equal(push.manual, true);

  // skill fora do catálogo vira nome legível
  assert.deepEqual(starter.loadout.skills.map((s) => s.name), ['Blessed Shield', 'Unknown Thing']);

  const [helm, chest, ring, seal, charm, set5, set4] = end.loadout.items;
  assert.equal(seal.name, 'Selo lendário');
  assert.equal(set5.name, 'Conjunto Paladino 01 (peça 5)');
  assert.equal(set4.set, 'Paladino 01');
  assert.equal(helm.kind, 'legendary');
  assert.equal(helm.aspect.namePt, 'Aspecto do Baluarte');
  assert.deepEqual(helm.runes, ['Bac']);
  assert.equal(chest.namePt, 'Manto do Cinzento');
  assert.equal(chest.powerPt, 'poder PT');
  assert.equal(chest.boss.id, 'harbinger-of-hatred');
  assert.equal(ring.mythic, true);
  assert.equal(ring.boss.name, 'qualquer boss');
  assert.equal(charm.charm, true);
  assert.equal(charm.name, 'Mantle of the Grey');

  const texts = end.steps.map((s) => s.text);
  assert.ok(texts.includes('Elmo: Aspecto do Baluarte (Códex).'));
  assert.ok(texts.includes('Peitoral: Manto do Cinzento — dropa de Harbinger of Hatred.'));
  assert.ok(texts.includes('Runas: Bac.'));
  assert.ok(texts.includes('Talismã: 2 peças do conjunto Paladino 01.'));
  assert.ok(texts.includes('Paragon: Iniciar (glifo Encantador).'));
  assert.equal(new Set(build.phases.flatMap((p) => p.steps.map((s) => s.id))).size, build.phases.flatMap((p) => p.steps).length);

  // resumo vem da fase de progressão mais avançada (Endgame)
  assert.deepEqual(build.skills, [{ slot: 'Barra 1', name: 'Blessed Shield' }]);
  assert.equal(build.keyItems[0], 'Manto do Cinzento (Peitoral) — Harbinger of Hatred');

  // escolha automática da fase
  assert.equal(currentPhase(build, { level: 30 }).id, lv.id);
  assert.equal(currentPhase(build, { level: 70, paragon: 50 }).id, starter.id);
  assert.equal(currentPhase(build, { level: 70, paragon: 300 }).id, end.id);
});

test('convertPlannerBuild sem catálogo ainda funciona e rejeita resposta inválida', () => {
  const build = convertPlannerBuild(plannerFixture());
  assert.equal(build.phases.length, 4);
  assert.equal(build.phases[2].loadout.items[1].name, 'Chest Unique Paladin 001'.replace(/^Chest /, ''));
  assert.throws(() => convertPlannerBuild({ id: 'x', data: '{"profiles":[]}' }), /sem perfis/);
  assert.throws(() => convertPlannerBuild({ ...plannerFixture(), class: 'Amazon', data: JSON.stringify({ profiles: [{ name: 'a', class: 'Amazon' }] }) }), /classe desconhecida/);
});

test('d4companion: nomes de aspecto e junção enUS/ptBR', () => {
  assert.equal(aspectFullName("Bulwark's", 'enUS'), "Bulwark's Aspect");
  assert.equal(aspectFullName('of Redirected Force', 'enUS'), 'Aspect of Redirected Force');
  assert.equal(aspectFullName('do Baluarte', 'ptBR'), 'Aspecto do Baluarte');
  assert.deepEqual(uniqueIds({ IdName: 'A', IdNameList: ['A'], IdNameItemList: ['A', 'Talisman_Charm_Unique_A'] }), ['A']);

  const empty = { enUS: [], ptBR: [] };
  const data = buildCompanionData({
    Uniques: {
      enUS: [{ IdName: 'Chest_X', IdNameList: ['Chest_X'], IdNameItemList: ['Chest_X', 'Chest_X_Alt'], Name: 'Mantle', Description: 'en' }],
      ptBR: [
        { IdName: 'Chest_X', Name: 'Manto', Description: 'pt #' },
        { IdName: 'Only_Pt', IdNameList: ['Only_Pt'], Name: 'Só PT', Description: 'd' },
      ],
    },
    Aspects: {
      enUS: [{ IdSno: '1', IdSnoList: ['1', '2'], IdName: 'asp', Name: 'of Might', Description: 'd', IsCodex: true, Dungeon: '' }],
      ptBR: [{ IdName: 'asp', Name: 'do Poder', Description: 'dp' }],
    },
    Runes: { enUS: [{ IdName: 'Item_Rune_A', Name: 'Bac', RuneType: 'condition', Description: 'x' }], ptBR: [] },
    ParagonBoards: { enUS: [{ IdName: 'B0', Name: 'Start' }], ptBR: [{ IdName: 'B0', Name: 'Iniciar' }] },
    ParagonGlyphs: empty,
  });
  assert.deepEqual(data.uniques.Chest_X_Alt, { name: 'Mantle', namePt: 'Manto', powerPt: 'pt #' });
  assert.deepEqual(data.uniques.Only_Pt, { name: null, namePt: 'Só PT', powerPt: 'd' });
  assert.equal(data.aspects['2'].namePt, 'Aspecto do Poder');
  assert.equal(data.aspects['2'].codex, true);
  assert.equal(data.aspects['2'].dungeon, null);
  assert.equal(data.runes.Item_Rune_A.descriptionPt, null);
  assert.equal(data.paragonBoards.B0.namePt, 'Iniciar');
});

test('dados gerados do d4companion cobrem o catálogo de únicos', { skip: !require('fs').existsSync(path.join(__dirname, '..', 'data', 'generated', 'd4companion.json')) }, () => {
  const comp = require('../data/generated/d4companion.json');
  const { uniques } = require('../data/generated/uniques.json');
  const missing = uniques.filter((u) => !comp.uniques[u.id]?.namePt).map((u) => u.id);
  assert.deepEqual(missing, []);
});
