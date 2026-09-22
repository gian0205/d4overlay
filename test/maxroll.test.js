'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { parsePlannerId, prettifyId, classifyProfile, convertPlannerBuild, pickParagonSteps, aspectOrigin } = require('../src/shared/maxroll');
const { currentPhase } = require('../src/shared/guide');
const { validateData } = require('../src/shared/validate');
const { aspectFullName, masculinePt, buildCompanionData, uniqueIds, cleanPower, isPlaceholderName } = require('../scripts/d4companion/lib');

// Mesmo formato de https://planners.maxroll.gg/profiles/d4/<id> (valores reduzidos).
function plannerFixture() {
  // como no planner real: cada perfil carrega a lista de etapas de Paragon do build
  const paragonSteps = [
    { name: 'Starter', data: [{ id: 'Paragon_Paladin_00', glyph: 'Rare_001_Intelligence_Main', glyphLevel: 50, rotation: 0, nodes: {} }] },
    {
      name: 'Endgame',
      data: [
        { id: 'Paragon_Paladin_00', glyph: 'Rare_001_Intelligence_Main', glyphLevel: 100, rotation: 0, nodes: {} },
        { id: 'Paragon_Paladin_01', glyph: null, glyphLevel: 0, rotation: 3, nodes: {} },
      ],
    },
  ];
  const profile = (name, skillBar, items, level = 70, extraSteps = []) => ({
    name,
    class: 'Paladin',
    level,
    items,
    skillBar,
    paragon: { steps: [...paragonSteps, ...extraSteps], position: paragonSteps.length - 1 },
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
        profile('Starter', ['Paladin_BlessedShield', 'Paladin_Unknown_Thing'], { 4: 1, 5: 2, 18: 9 }),
        profile('Endgame', ['Paladin_BlessedShield'], { 4: 1, 5: 2, 16: 3, 18: 8, 21: 4, 20: 5, 22: 6, 23: 7 }),
        profile('Pit Push', ['Paladin_BlessedShield'], { 4: 1, 8: 13, 20: 10, 21: 11, 22: 12 }, 70, [{ name: 'Pit Push', data: [{ id: 'Paragon_Paladin_01', rotation: 1, nodes: {} }] }]),
      ],
      items: {
        1: { id: 'Helm_Legendary_Generic_053', aspects: [{ nid: 2617264, values: [30] }], sockets: ['Rune_Condition_OnMove'] },
        // amuleto lendário: 2 aspectos; amuleto único: 1 aspecto; nid 0 = vazio
        8: { id: 'Amulet_Legendary_Generic_001', aspects: [{ nid: 2617264 }, { nid: 2999999 }, { nid: 0 }], sockets: [] },
        9: { id: 'Amulet_Unique_Generic_102', aspects: [{ nid: 2999999 }], sockets: [] },
        // órfão (não usado por nenhum perfil)
        91: { id: 'Boots_Legendary_Generic_001', aspects: [{ nid: 2617264 }] },
        2: { id: 'Chest_Unique_Paladin_001', aspects: [{ nid: 578784 }], sockets: [] },
        3: { id: 'Ring_Unique_Generic_099', aspects: [], sockets: [] },
        4: { id: 'Talisman_Charm_Unique_Chest_Unique_Paladin_001', aspects: [], sockets: [] },
        // selos reais trazem "aspects" com bônus de conjunto (nid que não é aspecto de Códex)
        5: { id: 'Talisman_Seal_Legendary', name: 'Dire Spine', aspects: [{ nid: 2620514 }] },
        10: { id: 'Talisman_Seal_MythicUnique_03', aspects: [{ nid: 2620514 }] },
        11: { id: 'Talisman_Charm_Set_Small_PreTorment_Generic02_03', aspects: [{ nid: 2617264 }] },
        12: { id: 'Talisman_Charm_Set_Small_PreTorment_Generic02_01' },
        13: { id: 'Runeword_Infinity_Mace2H', mythic: true, sockets: ['Gem_Skull_07'], aspects: [{ nid: 2617264 }] },
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
    { id: 'Amulet_Unique_Generic_102', name: 'Test Amulet', mythic: false, power: 'amulet' },
  ],
  companion: {
    uniques: { Chest_Unique_Paladin_001: { name: 'Mantle of the Grey', namePt: 'Manto do Cinzento', powerPt: 'poder PT' } },
    aspects: {
      2617264: { name: "Bulwark's Aspect", namePt: 'Aspecto do Baluarte', power: 'p', powerPt: 'pp' },
      2999999: {
        name: 'Aspect of Might', namePt: 'Aspecto do Poder', power: 'm', powerPt: 'mp',
        dungeon: 'Ghoa Ruins', dungeonPt: 'Ruínas de Ghoa', zone: 'in Kehjistan', zonePt: 'em Kehjistão',
      },
    },
    runes: { Item_Rune_Condition_OnMove: { name: 'Bac' } },
    paragonBoards: { Paragon_Paladin_00: { name: 'Start', namePt: 'Iniciar' }, Paragon_Paladin_01: { name: 'Stalwart', namePt: 'Pertinaz' } },
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

  const [helm, chest, ring, amulet, seal, charm, set5, set4] = end.loadout.items;
  assert.equal(end.loadout.items.length, 8); // o item órfão 91 não entra
  assert.equal(seal.name, 'Selo lendário');
  assert.equal(seal.aspects, undefined);
  // amuleto lendário: os dois aspectos (o nid 0 é ignorado)
  assert.deepEqual(amulet.aspects.map((a) => a.namePt), ['Aspecto do Baluarte', 'Aspecto do Poder']);
  assert.equal(amulet.aspect.namePt, 'Aspecto do Baluarte');
  // amuleto único da fase Starter: aspecto também é lido
  const uniqueAmulet = starter.loadout.items.find((i) => i.slotKey === 18);
  assert.equal(uniqueAmulet.kind, 'unique');
  assert.equal(uniqueAmulet.aspects[0].dungeonPt, 'Ruínas de Ghoa');
  assert.equal(uniqueAmulet.aspect, undefined);
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
  const byId = Object.fromEntries(end.steps.map((s) => [s.id, s.text]));
  assert.equal(byId['mx2-i4'], 'Elmo: Aspecto do Baluarte — obtido por drop.');
  assert.equal(byId['mx2-i18'], 'Amuleto: Aspecto do Baluarte — obtido por drop.');
  assert.equal(byId['mx2-i18-a1'], 'Amuleto: Aspecto do Poder — masmorra Ruínas de Ghoa, em Kehjistão.');
  assert.ok(texts.includes('Peitoral: Manto do Cinzento — dropa de Harbinger of Hatred.'));
  assert.ok(texts.includes('Runas: Bac.'));
  assert.ok(texts.includes('Talismã: 2 peças do conjunto Paladino 01.'));
  // Paragon da etapa com o mesmo nome da fase, com nível do glifo e rotação
  assert.equal(byId['mx2-paragon'], 'Paragon (etapa Endgame, 2/2): Iniciar [Encantador nv 100] · Pertinaz (rotação 270°).');
  const starterSteps = Object.fromEntries(starter.steps.map((s) => [s.id, s.text]));
  assert.equal(starterSteps['mx1-paragon'], 'Paragon (etapa Starter, 1/2): Iniciar [Encantador nv 50].');
  assert.equal(starterSteps['mx1-i18'], 'Amuleto: Test Amulet.');
  assert.equal(starterSteps['mx1-i18-a0'], 'Amuleto: Aspecto do Poder — masmorra Ruínas de Ghoa, em Kehjistão.');
  // leveling não tem etapa com o nome: usa a da mesma posição (0)
  assert.equal(lv.loadout.paragonStep.name, 'Starter');
  // variante com etapa própria de mesmo nome
  assert.equal(push.loadout.paragonStep.name, 'Pit Push');
  assert.equal(push.loadout.paragon[0].rotation, 90);
  // talismã: selo mítico vira passo; conjunto genérico de leveling é reconhecido; selo/conjunto sem aspecto
  const pushById = Object.fromEntries(push.steps.map((s) => [s.id, s.text]));
  assert.equal(pushById['mx3-seal-mythicunique-03'], 'Selo do talismã: Selo mítico 03.');
  assert.equal(pushById['mx3-set-generico-02-pre-tormento'], 'Talismã: 2 peças do conjunto genérico 02 (pré-Tormento).');
  assert.equal(byId['mx2-set-paladino-01'], 'Talismã: 2 peças do conjunto Paladino 01.');
  for (const it of push.loadout.items.filter((i) => i.kind === 'seal' || i.kind === 'set' || i.kind === 'runeword')) assert.equal(it.aspects, undefined);
  assert.equal(Object.keys(byId).some((k) => k.startsWith('mx2-seal')), false); // selo lendário não é item-chave
  // palavra rúnica: tipo próprio, nome sem a base da arma, passo no checklist
  const rw = push.loadout.items.find((i) => i.slotKey === 8);
  assert.deepEqual([rw.kind, rw.name, rw.mythic], ['runeword', 'Infinity', true]);
  assert.equal(pushById['mx3-i8'], 'Arma de 2 mãos (contundente): palavra rúnica Infinity (Mítica).');
  // único com nid que não é aspecto conhecido (id interno do planner): ignorado
  assert.equal(chest.aspects, undefined);
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

test('d4companion: nomes de aspecto, limpeza de texto e junção enUS/ptBR', () => {
  assert.equal(aspectFullName("Bulwark's", 'enUS'), "Bulwark's Aspect");
  assert.equal(aspectFullName('of Redirected Force', 'enUS'), 'Aspect of Redirected Force');
  assert.equal(aspectFullName('do Baluarte', 'ptBR'), 'Aspecto do Baluarte');
  assert.deepEqual(uniqueIds({ IdName: 'A;S14_A', IdNameList: ['A'], IdNameItemList: ['A', 'Talisman_Charm_Unique_A'] }), ['A', 'S14_A']);
  assert.equal(cleanPower('causa #%#% de dano'), 'causa #% de dano');
  assert.equal(cleanPower('(WIP)'), null);
  assert.equal(isPlaceholderName('Helm Unique Druid 98'), true);
  assert.equal(isPlaceholderName('Mantle of the Grey'), false);

  assert.equal(cleanPower('(WIP) Need to replace this with a generic benefit.'), null);
  assert.equal(cleanPower('WIP'), null);
  assert.equal(cleanPower('Phantom strikes deal # damage'), 'Phantom strikes deal # damage');

  // pt-BR: adjetivo no masculino depois de "Aspecto" (conferido contra os nomes oficiais [ms])
  assert.equal(masculinePt('Esmagadora'), 'Esmagador');
  assert.equal(masculinePt('Trapaceira'), 'Trapaceiro');
  assert.equal(masculinePt('Imorredoura'), 'Imorredouro');
  assert.equal(masculinePt('Sempiterna'), 'Sempiterno');
  assert.equal(masculinePt('Embebida em Sombras'), 'Embebido em Sombras');
  assert.equal(masculinePt('Velada na Neve'), 'Velado na Neve');
  for (const same of ['Oportunista', 'Brutal', 'Feroz', 'Lança-chamas', 'Cortassombras', 'Alta Velocidade', 'Mestre em Armas', 'Clandestino']) {
    assert.equal(masculinePt(same), same);
  }
  assert.equal(aspectFullName('Aproveitadora', 'ptBR'), 'Aspecto Aproveitador');
  assert.equal(aspectFullName('da Força Redirecionada', 'ptBR'), 'Aspecto da Força Redirecionada');

  const empty = { enUS: [], ptBR: [] };
  const catalog = new Map([
    ['Chest_X', { name: 'Mantle', power: 'en' }],
    ['Gloves_A', { name: 'Flameweaver', power: 'burn # enemies' }],
    ['Gloves_C', { name: 'Other', power: 'different power' }],
    ['Ring_X', { name: 'Alpha Ring', power: 'ring alpha' }],
    ['Ring_Y', { name: 'Beta Ring', power: 'ring beta' }],
    ['Gloves_B', { name: 'Wraps', power: 'Lightning gains 1 strike and deals # damage' }],
  ]);
  const { data, stats } = buildCompanionData({
    Uniques: {
      enUS: [
        { IdName: 'Chest_X', IdNameList: ['Chest_X'], IdNameItemList: ['Chest_X', 'Chest_X_Alt'], Name: 'Mantle', Description: 'en' },
        // entrada fundida: o id Gloves_A é do Flameweaver, mas o nome/pt são de outro item (mesmo poder)
        { IdName: 'Gloves_A', IdNameList: ['Gloves_A'], IdNameItemList: ['Gloves_A', 'Gloves_Z'], Name: "Bucrani's Grip", Description: 'burn #% enemies' },
        // nome diverge E o poder também: nada é aproveitado
        { IdName: 'Gloves_C', IdNameList: ['Gloves_C'], IdNameItemList: ['Gloves_C'], Name: 'Wrong', Description: 'x' },
        // separados no inglês…
        { IdName: 'Ring_X', IdNameList: ['Ring_X'], IdNameItemList: ['Ring_X'], Name: 'Alpha Ring', Description: 'ring alpha' },
        { IdName: 'Ring_Y', IdNameList: ['Ring_Y'], IdNameItemList: ['Ring_Y'], Name: 'Beta Ring', Description: 'ring beta' },
        // nome em inglês é só o id, mas o poder bate: aceita pelo poder
        { IdName: 'Gloves_B', IdNameList: ['Gloves_B'], IdNameItemList: ['Gloves_B'], Name: 'Pants Unique Druid 97', Description: 'Lightning gains 1 strike and deals #% damage' },
      ],
      ptBR: [
        { IdName: 'Chest_X', Name: 'Manto', Description: 'pt #%#%' },
        { IdName: 'Gloves_A', IdNameList: ['Gloves_A'], IdNameItemList: ['Gloves_A', 'Gloves_Z'], Name: 'Guante de Bucrani', Description: 'queima # inimigos' },
        { IdName: 'Gloves_C', IdNameList: ['Gloves_C'], IdNameItemList: ['Gloves_C'], Name: 'Errado', Description: 'e' },
        { IdName: 'Gloves_B', Name: 'Ataduras', Description: 'z' },
        { IdName: 'Only_Pt', IdNameList: ['Only_Pt'], Name: 'Só PT', Description: 'd' },
        { IdName: 'Helm_Q', IdNameList: ['Helm_Q'], Name: 'Helm Unique Druid 98', Description: 'd' },
        // …fundidos no pt-BR
        { IdName: 'Ring_X;Ring_Y', IdNameList: ['Ring_X', 'Ring_Y'], IdNameItemList: ['Ring_X', 'Ring_Y'], Name: 'Anel Alfa', Description: 'anel pt' },
      ],
    },
    Aspects: {
      enUS: [
        { IdSno: '1', IdSnoList: ['1', '2'], IdNameList: ['asp_1', 'asp_2'], IdName: 'asp_1;asp_2', Name: 'of Might', Description: 'd', IsCodex: true, Dungeon: 'Ghoa Ruins ' },
        // fundido nos dois idiomas (caso real: of Intricacy / das Incisões Temporais)
        { IdSno: '5', IdSnoList: ['5', '6'], IdNameList: ['asp_5', 'asp_6'], IdName: 'asp_5;asp_6', Name: 'of Intricacy', Description: 'i', Dungeon: '' },
        // separados no inglês, fundidos no pt-BR
        { IdSno: '7', IdSnoList: ['7'], IdNameList: ['asp_7'], IdName: 'asp_7', Name: 'of Alpha', Description: 'a' },
        { IdSno: '8', IdSnoList: ['8'], IdNameList: ['asp_8'], IdName: 'asp_8', Name: 'of Beta', Description: 'b' },
      ],
      ptBR: [
        { IdSnoList: ['7', '8'], IdName: 'asp_7;asp_8', Name: 'do Alfa', Description: 'ap' },
        { IdSnoList: ['1'], IdName: 'asp_1', Name: 'do Poder', Description: 'dp' },
        { IdSnoList: ['2'], IdName: 'asp_2', Name: 'do Dilúvio', Description: 'dd' }, // outro aspecto no pt-BR
        { IdSnoList: ['5', '6'], IdName: 'asp_5;asp_6', Name: 'das Incisões Temporais', Description: 'ip' },
      ],
    },
    Runes: { enUS: [{ IdName: 'Item_Rune_A', Name: 'Bac', RuneType: 'condition', Description: 'x' }], ptBR: [] },
    ParagonBoards: { enUS: [{ IdName: 'B0', Name: 'Start' }], ptBR: [{ IdName: 'B0', Name: 'Iniciar' }] },
    ParagonGlyphs: empty,
    Sigils: {
      // o sigilo que não é masmorra vem ANTES, para o teste depender do filtro Type === 'Dungeon'
      enUS: [
        { IdSno: 11, Name: 'Ghoa Ruins', DungeonZoneInfo: 'in Nowhere', Type: 'Minor' },
        { IdSno: 10, Name: 'Ghoa Ruins', DungeonZoneInfo: 'in Kehjistan', Type: 'Dungeon' },
      ],
      ptBR: [
        { IdSno: 11, Name: 'Outra', DungeonZoneInfo: 'em ', Type: 'Minor' },
        { IdSno: 10, Name: 'Ruínas de Ghoa', DungeonZoneInfo: 'em Kehjistão', Type: 'Dungeon' },
      ],
    },
  }, { catalog });

  assert.deepEqual(data.uniques.Chest_X_Alt, { name: 'Mantle', namePt: 'Manto', powerPt: 'pt #%' });
  // não herda o nome de outro item, mas mantém o poder pt-BR (o D4C só funde itens com o mesmo poder)
  assert.deepEqual(data.uniques.Gloves_A, { name: 'Flameweaver', namePt: null, powerPt: 'queima # inimigos' });
  assert.equal(data.uniques.Gloves_C, undefined); // nome e poder divergem: nada
  assert.equal(data.uniques.Gloves_Z.namePt, 'Guante de Bucrani'); // id fora do nosso catálogo: mantém
  assert.equal(data.uniques.Gloves_B.namePt, 'Ataduras');
  assert.equal(data.uniques.Gloves_B.name, 'Wraps');
  assert.deepEqual(data.uniques.Only_Pt, { name: null, namePt: 'Só PT', powerPt: 'd' });
  assert.equal(data.uniques.Helm_Q, undefined); // nome pt que é só id
  assert.deepEqual(stats.uniqueNameMismatch, ['Gloves_A: nosso "Flameweaver", D4C "Bucrani\'s Grip"', 'Gloves_C: nosso "Other", D4C "Wrong"']);
  assert.equal(data.aspects['5'].nameUncertain, true);
  assert.equal(data.aspects['6'].nameUncertain, true);
  assert.equal(data.aspects['1'].nameUncertain, undefined);
  // fundido SÓ no pt-BR (já aconteceu no histórico do D4C): também fica "a confirmar"
  assert.equal(data.aspects['7'].nameUncertain, true);
  assert.equal(data.aspects['8'].nameUncertain, true);
  assert.equal(data.aspects['7'].name, 'Aspect of Alpha');
  // único fundido no pt-BR entre dois itens do catálogo: nenhum dos dois leva o nome pt, ambos o poder
  assert.deepEqual(data.uniques.Ring_X, { name: 'Alpha Ring', namePt: null, powerPt: 'anel pt' });
  assert.deepEqual(data.uniques.Ring_Y, { name: 'Beta Ring', namePt: null, powerPt: 'anel pt' });
  assert.equal(stats.uniqueNameAmbiguous.length, 2);

  // aspectos por sno: o sno 2 é outro aspecto no pt-BR, então o inglês do grupo não vale
  assert.equal(data.aspects['1'].name, 'Aspect of Might');
  assert.equal(data.aspects['1'].namePt, 'Aspecto do Poder');
  assert.equal(data.aspects['2'].name, null);
  assert.equal(data.aspects['2'].namePt, 'Aspecto do Dilúvio');
  assert.equal(data.aspects['2'].id, 'asp_2');
  // origem pela masmorra (nome em inglês com trim → sigilo Dungeon → pt por IdSno)
  assert.deepEqual(
    [data.aspects['1'].dungeon, data.aspects['1'].dungeonPt, data.aspects['1'].zone, data.aspects['1'].zonePt],
    ['Ghoa Ruins', 'Ruínas de Ghoa', 'in Kehjistan', 'em Kehjistão'],
  );
  assert.equal(data.aspects['1'].codex, undefined);
  assert.equal(data.runes.Item_Rune_A.descriptionPt, null);
  assert.equal(data.paragonBoards.B0.namePt, 'Iniciar');
});

// perfis com a lista de etapas de Paragon: [nome, nível máximo de glifo]
const planner = (profiles) => profiles.map(([name, steps]) => ({
  name,
  paragon: { steps: steps.map(([n, g]) => ({ name: n, data: [{ id: 'B', glyphLevel: g }] })) },
}));
const stepNames = (profiles) => {
  const idx = pickParagonSteps(profiles);
  return profiles.map((p, i) => (idx[i] == null ? null : p.paragon.steps[idx[i]].name));
};

test('pickParagonSteps: etapas com nome (fciqow0w, jx4aye0q, bq4p40tq)', () => {
  const s = [['Starter', 50], ['Midgame', 100], ['Endgame', 150]];
  assert.deepEqual(stepNames(planner([['Starter', s], ['Midgame', s], ['Endgame', s], ['Push', [...s, ['Push', 150]]]])), ['Starter', 'Midgame', 'Endgame', 'Push']);
  const jx = [['Board Rush', 1], ['Starter', 15], ['Midgame', 50], ['Endgame', 100], ['Complete', 150]];
  assert.deepEqual(stepNames(planner([['Starter', jx], ['Endgame', jx], ['Push', [['Push', 150]]]])), ['Starter', 'Endgame', 'Push']);
  // nome contido: "Step 3 - Endgame", "Midgame Selig" ⊇ "Midgame"; "Push" ≠ "Pushing 100"
  assert.deepEqual(stepNames(planner([['Endgame', [['Step 1', 1], ['Step 3 - Endgame', 100]]]])), ['Step 3 - Endgame']);
  assert.deepEqual(stepNames(planner([['Midgame Selig', [['Starter', 50], ['Midgame', 100]]]])), ['Midgame']);
  assert.deepEqual(stepNames(planner([['Push', [['Starter', 50], ['Pushing 100', 150], ['Other', 150]]]])), ['Other']);
  assert.deepEqual(stepNames(planner([['Sem etapas', []]])), [null]);
});

test('pickParagonSteps: etapas "Step N" sem nome da fase (5lbyoc0h, qeyb7t0x, oi24ee0q)', () => {
  // 5lbyoc0h: Step 1 tem glifo nv 1 (leveling); Starter/Midgame/Endgame = Step 2/3/4
  const five = [['Step 1', 1], ['Step 2', 50], ['Step 3', 100], ['Step 4', 150]];
  assert.deepEqual(
    stepNames(planner([['Leveling Skill Tree', [['Variant 1', 0]]], ['Leveling 1-70', five], ['Starter', five], ['Midgame', five], ['Endgame', five], ['Push', five]])),
    ['Variant 1', 'Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 4'],
  );
  // qeyb7t0x: Rush e Step 1 são de leveling (glifo nv 1)
  const q = [['Rush', 1], ['Step 1', 1], ['Step 2', 51], ['Step 3', 100], ['Step 4', 150]];
  const q4 = [['Step 1', 1], ['Step 2', 51], ['Step 3', 100], ['Step 4', 150]];
  assert.deepEqual(
    stepNames(planner([['Leveling 1-70', q], ['Starter', q], ['Midgame', q], ['Endgame', q], ['Push', q], ['Speedfarm', q], ['Midgame Selig', q4], ['Selig Variant', q4]])),
    ['Rush', 'Step 2', 'Step 3', 'Step 4', 'Step 4', 'Step 4', 'Step 3', 'Step 4'],
  );
  // oi24ee0q: "Step 3 - Endgame" é âncora; Starter e Midgame vêm antes dela
  const o = [['Step 1', 1], ['Step 2', 50], ['Step 3 - Endgame', 100], ['Step 4', 150]];
  assert.deepEqual(stepNames(planner([['Starter', o], ['Midgame', o], ['Endgame', o]])), ['Step 1', 'Step 2', 'Step 3 - Endgame']);
  // 5zxmig0x: mais etapas que fases — Endgame fica na última (G150), Midgame no meio
  const z = [['1. Unlock Paragon', 0], ['2. Spent 164 | 5B Rush', 1], ['3. Spent 195 | G25', 25], ['4. Spent 230 | G51', 51], ['5. Spent 260 | G75', 75], ['6. Spent 290 | G100', 100], ['7. Spent 342 | G150', 150]];
  assert.deepEqual(
    stepNames(planner([['Leveling', z], ['Starter', z], ['Midgame', z], ['Endgame', z], ['Speedfarm', z]])),
    ['1. Unlock Paragon', '3. Spent 195 | G25', '5. Spent 260 | G75', '7. Spent 342 | G150', '7. Spent 342 | G150'],
  );
});

test('runewordName tira a base da arma', () => {
  const { runewordName } = require('../src/shared/maxroll');
  assert.equal(runewordName('Enigma'), 'Enigma');
  assert.equal(runewordName('Infinity_Mace2H'), 'Infinity');
  assert.equal(runewordName('Insight_Polearm'), 'Insight');
  assert.equal(runewordName('Spirit_1HSword'), 'Spirit');
  assert.equal(runewordName('Holy_Thunder'), 'Holy Thunder');
});

test('aspectOrigin: masmorra com região ou drop', () => {
  assert.equal(aspectOrigin({ dungeon: 'Ghoa Ruins', dungeonPt: 'Ruínas de Ghoa', zonePt: 'em Kehjistão' }), 'masmorra Ruínas de Ghoa, em Kehjistão');
  assert.equal(aspectOrigin({ dungeon: 'Ghoa Ruins' }), 'masmorra Ghoa Ruins');
  assert.equal(aspectOrigin({ name: 'x' }), 'obtido por drop');
  assert.equal(aspectOrigin({ unknown: true }), null);
});

const GENERATED = path.join(__dirname, '..', 'data', 'generated', 'd4companion.json');
test('dados gerados do d4companion: pt-BR confiável para o catálogo de únicos', { skip: !require('fs').existsSync(GENERATED) }, () => {
  const comp = require(GENERATED);
  const { uniques } = require('../data/generated/uniques.json');
  const byName = Object.fromEntries(uniques.map((u) => [u.name, comp.uniques[u.id]?.namePt ?? null]));
  // nunca o nome pt de outro item (hoje o D4C funde Flameweaver com Bucrani's Grip):
  // null é aceito, e se o upstream corrigir, o nome certo também
  for (const n of ['Flameweaver', "Esu's Heirloom", 'Raiment of the Infinite']) {
    assert.ok(!/bucrani/i.test(byName[n] ?? ''), `${n} recebeu o nome pt de outro item: ${byName[n]}`);
  }
  assert.equal(byName['Fields of Crimson'], 'Prado Carmesim');
  assert.equal(byName["Unsung Ascetic's Wraps"], 'Ataduras do Ascético Anônimo');
  const missing = uniques.filter((u) => !comp.uniques[u.id]?.namePt);
  assert.ok(missing.length <= 12, `muitos únicos sem pt-BR: ${missing.map((u) => u.name).join(', ')}`);
  // o poder pt-BR não depende do nome: todos os únicos do catálogo têm
  assert.deepEqual(uniques.filter((u) => !comp.uniques[u.id]?.powerPt).map((u) => u.name), []);
  assert.ok(!Object.values(comp.uniques).some((u) => /\bunique\b.*\d+$/i.test(u.namePt ?? '')), 'nome pt que é só id');
  // masmorras dos aspectos casaram com os sigilos
  const aspects = Object.values(comp.aspects);
  assert.ok(aspects.some((a) => a.dungeonPt));
  assert.ok(aspects.filter((a) => a.dungeon).every((a) => a.dungeonPt));
});
