'use strict';

/**
 * Importa builds do planner do Maxroll.
 * O planner expõe o build como JSON público em
 *   https://planners.maxroll.gg/profiles/d4/<id>
 * (mesmo endereço usado pelo Diablo4Companion). O campo `data` é um JSON em
 * string com `profiles` (as fases: Starter/Endgame/Push…) e `items`.
 * Os ids de skills e itens são os mesmos dos arquivos do jogo (d4data), e os
 * aspectos usam o mesmo "sno" dos dados do Diablo4Companion.
 */

const { classIdFrom, className } = require('./classes');
const { MAX_LEVEL } = require('./guide');
const { normalize } = require('./text');

const PLANNER_API = 'https://planners.maxroll.gg/profiles/d4/';
const PLANNER_PAGE = 'https://maxroll.gg/d4/planner/';
const BUILD_LIST_PAGE = 'https://maxroll.gg/d4/planner/maxroll-builds';

/** Chaves de slot do planner (mesma tabela do Diablo4Companion). */
const SLOTS = {
  4: 'Elmo',
  5: 'Peitoral',
  6: 'Mão secundária',
  7: 'Arma',
  8: 'Arma de 2 mãos (contundente)',
  9: 'Arma de 2 mãos (cortante)',
  10: 'Arma de longo alcance',
  11: 'Arma (mão principal)',
  12: 'Arma (mão secundária)',
  13: 'Luvas',
  14: 'Calças',
  15: 'Botas',
  16: 'Anel 1',
  17: 'Anel 2',
  18: 'Amuleto',
  20: 'Selo do talismã',
  21: 'Amuleto do talismã 1',
  22: 'Amuleto do talismã 2',
  23: 'Amuleto do talismã 3',
  24: 'Amuleto do talismã 4',
  25: 'Amuleto do talismã 5',
  26: 'Amuleto do talismã 6',
};

/** Abreviações de classe nos ids de conjuntos de talismã ("Talisman_Charm_Set_Pala_01_05"). */
const SET_CLASS = { barb: 'barbarian', druid: 'druid', necro: 'necromancer', rogue: 'rogue', sorc: 'sorcerer', spirit: 'spiritborn', pala: 'paladin', lock: 'warlock', warlock: 'warlock' };
const RARITY_PT = { legendary: 'lendário', rare: 'raro', magic: 'mágico', common: 'comum', mythic: 'mítico' };

/** Aceita o id ("fciqow0w") ou qualquer URL do planner. */
function parsePlannerId(input) {
  const text = String(input ?? '').trim();
  const fromUrl = text.match(/(?:planner|profiles\/d4)\/([a-z0-9]{6,16})\b/i);
  if (fromUrl) return fromUrl[1].toLowerCase();
  return /^[a-z0-9]{6,16}$/i.test(text) ? text.toLowerCase() : null;
}

/** "Paladin_BlessedShield" → "Blessed Shield" (quando a skill não está no catálogo). */
function prettifyId(id) {
  return String(id ?? '')
    .replace(/^[A-Za-z]+?_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

/**
 * Índices usados na conversão. Todos opcionais: sem eles o build ainda é
 * importado, só que com menos detalhes.
 *  - skills: { [classId]: [{ id, name }] }            (data/generated/skills.json)
 *  - uniques: [{ id, name, mythic, slotPt }]           (data/generated/uniques.json)
 *  - companion: data/generated/d4companion.json        (nomes ptBR, aspectos, runas, Paragon)
 *  - bosses: bosses.json (para dizer qual boss dropa cada único)
 */
function makeIndex({ skills, uniques, companion, bosses } = {}) {
  const skillById = new Map();
  for (const list of Object.values(skills ?? {})) for (const s of list) skillById.set(s.id, s);

  const uniqueById = new Map((uniques ?? []).map((u) => [u.id, u]));
  const uniqueByName = new Map((uniques ?? []).map((u) => [normalize(u.name), u]));

  const bossByUnique = new Map();
  for (const boss of bosses?.bosses ?? []) {
    for (const drop of boss.drops ?? []) bossByUnique.set(normalize(drop.name), boss);
  }
  const anyBoss = new Set([...(bosses?.generalPool ?? []), ...(bosses?.iconicMythics ?? [])].map(normalize));
  return { skillById, uniqueById, uniqueByName, bossByUnique, anyBoss, companion: companion ?? {} };
}

/** De onde vem o único: boss dedicado, qualquer boss (pool geral/Mítico) ou nada conhecido. */
function dropSource(name, mythic, index) {
  const boss = index.bossByUnique.get(normalize(name));
  if (boss) return { id: boss.id, name: boss.name };
  if (mythic || index.anyBoss.has(normalize(name))) return { id: null, name: 'qualquer boss' };
  return null;
}

function resolveItem(raw, slotKey, index) {
  const id = raw?.id ?? '';
  const slot = SLOTS[slotKey] ?? `Slot ${slotKey}`;
  const comp = index.companion;
  // amuleto do talismã com o poder de um único: "Talisman_Charm_Unique_<id do único>"
  const baseId = id.replace(/^Talisman_Charm_Unique_/i, '');

  const uniqueComp = comp.uniques?.[baseId];
  const uniqueCat = index.uniqueById.get(baseId) ?? (uniqueComp && index.uniqueByName.get(normalize(uniqueComp.name)));
  const item = { slotKey: Number(slotKey), slot, id };
  if (baseId !== id) item.charm = true;

  const set = id.match(/^Talisman_Charm_Set_([A-Za-z]+)_(\d+)_(\d+)$/i);
  const seal = id.match(/^Talisman_Seal_([A-Za-z]+)/i);
  if (set) {
    const classId = classIdFrom(SET_CLASS[set[1].toLowerCase()] ?? set[1]);
    item.kind = 'set';
    item.set = `${classId ? className(classId) : set[1]} ${set[2]}`;
    item.name = `Conjunto ${item.set} (peça ${Number(set[3])})`;
  } else if (seal && !/_Unique_/i.test(id)) {
    item.kind = 'seal';
    item.name = `Selo ${RARITY_PT[seal[1].toLowerCase()] ?? seal[1]}`;
  } else if (uniqueCat || uniqueComp || /_Unique_/i.test(baseId)) {
    const name = uniqueCat?.name ?? uniqueComp?.name ?? prettifyId(baseId);
    item.kind = 'unique';
    item.name = name;
    item.namePt = uniqueComp?.namePt ?? null;
    item.power = uniqueCat?.power ?? null;
    item.powerPt = uniqueComp?.powerPt ?? null;
    item.mythic = Boolean(uniqueCat?.mythic);
    const source = dropSource(name, item.mythic, index);
    if (source) item.boss = source;
  } else {
    item.kind = 'legendary';
    const nid = raw?.aspects?.[0]?.nid;
    const aspect = nid != null ? comp.aspects?.[String(nid)] : null;
    if (aspect) {
      item.aspect = {
        name: aspect.name,
        namePt: aspect.namePt,
        power: aspect.power,
        powerPt: aspect.powerPt,
        codex: aspect.codex,
        dungeon: aspect.dungeon,
      };
    } else if (nid != null) {
      item.aspect = { name: `Aspecto ${nid}`, unknown: true };
    }
  }

  const runes = (raw?.sockets ?? [])
    .filter((s) => typeof s === 'string' && /^Rune_/i.test(s))
    .map((s) => comp.runes?.[`Item_${s}`]?.name ?? prettifyId(s.replace(/^Rune_/, 'x_')));
  if (runes.length) item.runes = runes;
  return item;
}

function resolveParagon(profile, index) {
  const steps = profile?.paragon?.steps ?? [];
  const last = steps[steps.length - 1];
  const comp = index.companion;
  return (last?.data ?? []).map((b) => ({
    board: comp.paragonBoards?.[b.id]?.name ?? b.id,
    boardPt: comp.paragonBoards?.[b.id]?.namePt ?? null,
    glyph: b.glyph ? (comp.paragonGlyphs?.[b.glyph]?.name ?? b.glyph) : null,
    glyphPt: b.glyph ? (comp.paragonGlyphs?.[b.glyph]?.namePt ?? null) : null,
  }));
}

const pt = (en, ptName) => ptName || en;

/**
 * O planner marca quase todos os perfis com o nível máximo, então o papel de
 * cada perfil vem do nome: leveling, progressão do endgame ou variante.
 */
function classifyProfile(name) {
  const n = String(name ?? '').toLowerCase();
  if (/level|leveling|\b1\s*-\s*\d+\b|campaign|campanha/.test(n)) return { role: 'leveling' };
  if (/push|speed|farm|uber|boss|tower|torre|hardcore|\bhc\b|variant|\balt\b|lazy/.test(n)) return { role: 'variant' };
  if (/start|early|begin|inicial/.test(n)) return { role: 'progress', paragon: 0 };
  if (/mid/.test(n)) return { role: 'progress', paragon: 100 };
  if (/end|late|final|\bbis\b/.test(n)) return { role: 'progress', paragon: 200 };
  if (/pit/.test(n)) return { role: 'variant' };
  return { role: 'progress' };
}

/** Define minLevel/maxLevel/minParagon/manual de cada fase (muta as fases). */
function assignPhaseRanges(phases, profiles) {
  let levelingSeen = false;
  let lastParagon = -50;
  let prevMax = 0;
  phases.forEach((phase, i) => {
    const level = Number(profiles[i].level) || MAX_LEVEL;
    const kind = classifyProfile(profiles[i].name);
    if (level < MAX_LEVEL) {
      // planners antigos: o próprio nível do perfil delimita o leveling
      phase.minLevel = prevMax + 1;
      phase.maxLevel = level;
      prevMax = level;
    } else if (kind.role === 'leveling') {
      if (levelingSeen) phase.manual = true;
      else Object.assign(phase, { minLevel: 1, maxLevel: MAX_LEVEL - 1 });
      levelingSeen = true;
    } else if (kind.role === 'variant') {
      phase.manual = true;
    } else {
      const paragon = Math.max(kind.paragon ?? lastParagon + 50, lastParagon + 1);
      phase.minParagon = paragon;
      lastParagon = paragon;
    }
  });
  // sem nenhuma fase de progressão: a primeira variante vira o endgame padrão
  if (!phases.some((p) => p.minParagon !== undefined)) {
    const first = phases.find((p) => p.manual && p.minLevel === undefined) ?? phases.find((p) => p.minLevel === undefined);
    if (first) {
      delete first.manual;
      first.minParagon = 0;
    }
  }
}

/** Passos do checklist de uma fase (ids estáveis entre reimportações). */
function phaseSteps(phaseId, loadout) {
  const steps = [];
  if (loadout.skills.length) {
    steps.push({ id: `${phaseId}-skills`, text: `Barra de skills: ${loadout.skills.map((s) => s.name).join(', ')}.` });
  }
  for (const item of loadout.items) {
    if (item.kind === 'unique') {
      const where = item.boss ? ` — dropa de ${item.boss.name}` : '';
      const tags = [item.mythic ? 'Mítico' : null, item.charm ? 'poder no talismã' : null].filter(Boolean);
      steps.push({ id: `${phaseId}-i${item.slotKey}`, text: `${item.slot}: ${pt(item.name, item.namePt)}${tags.length ? ` (${tags.join(', ')})` : ''}${where}.` });
    } else if (item.aspect && !item.aspect.unknown) {
      const where = item.aspect.codex ? ' (Códex)' : item.aspect.dungeon ? ` — masmorra ${item.aspect.dungeon}` : '';
      steps.push({ id: `${phaseId}-i${item.slotKey}`, text: `${item.slot}: ${pt(item.aspect.name, item.aspect.namePt)}${where}.` });
    }
  }
  const sets = new Map();
  for (const it of loadout.items) if (it.kind === 'set') sets.set(it.set, (sets.get(it.set) ?? 0) + 1);
  for (const [name, count] of sets) {
    steps.push({ id: `${phaseId}-set-${normalize(name).replace(/\s+/g, '-')}`, text: `Talismã: ${count} peça${count > 1 ? 's' : ''} do conjunto ${name}.` });
  }
  const runes = [...new Set(loadout.items.flatMap((i) => i.runes ?? []))];
  if (runes.length) steps.push({ id: `${phaseId}-runes`, text: `Runas: ${runes.join(', ')}.` });
  if (loadout.paragon.length) {
    const boards = loadout.paragon.map((p) => `${pt(p.board, p.boardPt)}${p.glyph ? ` (glifo ${pt(p.glyph, p.glyphPt)})` : ''}`);
    steps.push({ id: `${phaseId}-paragon`, text: `Paragon: ${boards.join(' → ')}.` });
  }
  return steps;
}

/**
 * Converte a resposta do planner no formato de build do app
 * (o mesmo de data/builds.json, com `phases[].loadout` a mais).
 */
function convertPlannerBuild(raw, indexOrSources = {}) {
  const index = indexOrSources.skillById ? indexOrSources : makeIndex(indexOrSources);
  const data = typeof raw?.data === 'string' ? JSON.parse(raw.data) : raw?.data;
  if (!raw?.id || !data?.profiles?.length) throw new Error('resposta do planner sem perfis');

  const classId = classIdFrom(raw.class ?? data.profiles[0]?.class);
  if (!classId) throw new Error(`classe desconhecida: ${raw.class}`);
  const items = data.items ?? {};

  const phases = data.profiles.map((profile, i) => {
    const id = `mx${i}`;
    const loadout = {
      skills: (profile.skillBar ?? []).filter(Boolean).map((sid) => ({ id: sid, name: index.skillById.get(sid)?.name ?? prettifyId(sid) })),
      items: Object.entries(profile.items ?? {})
        .filter(([, idx]) => items[idx])
        .map(([slotKey, idx]) => resolveItem(items[idx], slotKey, index))
        .sort((a, b) => a.slotKey - b.slotKey),
      paragon: resolveParagon(profile, index),
    };
    const level = Number(profile.level) || MAX_LEVEL;
    const phase = { id, name: String(profile.name || `Perfil ${i + 1}`).trim() };
    const uniques = loadout.items.filter((it) => it.kind === 'unique').length;
    phase.focus = `Nível ${level} · ${loadout.skills.length} skills · ${loadout.items.length} itens (${uniques} únicos)`;
    phase.steps = phaseSteps(id, loadout);
    phase.loadout = loadout;
    return phase;
  });
  assignPhaseRanges(phases, data.profiles);

  // resumo do build = fase de progressão mais avançada
  const progression = phases.filter((p) => p.minParagon !== undefined).sort((a, b) => b.minParagon - a.minParagon);
  const main = progression[0] ?? phases[phases.length - 1];
  const updated = String(raw.date ?? '').slice(0, 10);
  return {
    id: `maxroll-${raw.id}`,
    classId,
    name: raw.name ?? `Build ${raw.id}`,
    playstyle: [
      'Importado do planner do Maxroll',
      raw.user?.username ? `por ${raw.user.username}` : null,
      raw.season ? `Temporada ${raw.season}` : null,
      updated ? `atualizado em ${updated}` : null,
    ].filter(Boolean).join(' · '),
    difficulty: 'Maxroll',
    source: { kind: 'maxroll', plannerId: raw.id, season: raw.season ?? null, updated: raw.date ?? null, importedAt: new Date().toISOString() },
    links: [{ label: 'Abrir no planner do Maxroll', url: `${PLANNER_PAGE}${raw.id}` }],
    skills: main.loadout.skills.map((s, i) => ({ slot: `Barra ${i + 1}`, name: s.name })),
    stats: [],
    keyItems: main.loadout.items
      .filter((it) => it.kind === 'unique')
      .map((it) => `${pt(it.name, it.namePt)} (${it.slot})${it.boss ? ` — ${it.boss.name}` : ''}`),
    phases,
  };
}

module.exports = {
  PLANNER_API,
  PLANNER_PAGE,
  BUILD_LIST_PAGE,
  SLOTS,
  parsePlannerId,
  prettifyId,
  classifyProfile,
  makeIndex,
  convertPlannerBuild,
};
