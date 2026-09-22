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
const RARITY_PT = { legendary: 'lendário', rare: 'raro', magic: 'mágico', common: 'comum', mythic: 'mítico', mythicunique: 'mítico', unique: 'único' };

/** "Infinity_Mace2H" → "Infinity"; "Holy_Thunder_Scepter" → "Holy Thunder"; "Enigma" → "Enigma". */
const WEAPON_BASE = /^(?:\d?H?(?:Mace|Sword|Axe|Polearm|Staff|Bow|Crossbow|Dagger|Scythe|Wand|Focus|Shield|Totem|Glaive|Quarterstaff|Flail|Scepter)\d?H?|\d+H\w*)$/i;
function runewordName(raw) {
  const parts = String(raw).split('_').filter(Boolean);
  while (parts.length > 1 && WEAPON_BASE.test(parts[parts.length - 1])) parts.pop();
  return parts.join(' ');
}

/** "Pala_01" → "Paladino 01"; "Small_PreTorment_Generic02" → "genérico 02 (pré-Tormento)". */
function setName(raw) {
  const cls = raw.match(/^([A-Za-z]+)_(\d+)$/);
  if (cls) {
    const classId = classIdFrom(SET_CLASS[cls[1].toLowerCase()] ?? cls[1]);
    return `${classId ? className(classId) : cls[1]} ${cls[2]}`;
  }
  const generic = raw.match(/Generic_?(\d+)$/i);
  if (generic) return `genérico ${generic[1]}${/pre_?torment/i.test(raw) ? ' (pré-Tormento)' : ''}`;
  return prettifyId(`x_${raw}`);
}

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

/** Aspecto pelo sno do planner; origem = masmorra do Códex (quando há) ou drop. */
function resolveAspect(nid, comp) {
  const a = comp.aspects?.[String(nid)];
  if (!a) return { nid, name: `Aspecto ${nid}`, unknown: true };
  return {
    nid,
    name: a.name ?? a.namePt,
    namePt: a.namePt,
    ...(a.nameUncertain ? { nameUncertain: true } : {}),
    power: a.power,
    powerPt: a.powerPt,
    dungeon: a.dungeon ?? null,
    dungeonPt: a.dungeonPt ?? null,
    zone: a.zone ?? null,
    zonePt: a.zonePt ?? null,
  };
}

/** "masmorra Uma Jornada pelo Passado, em Kehjistão" / "obtido por drop". */
function aspectOrigin(aspect) {
  if (!aspect || aspect.unknown) return null;
  if (aspect.dungeon) {
    const zone = aspect.zonePt || aspect.zone;
    return `masmorra ${aspect.dungeonPt || aspect.dungeon}${zone ? `, ${zone}` : ''}`;
  }
  return 'obtido por drop';
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

  // conjunto do talismã: "Talisman_Charm_Set_Pala_01_05" (classe) ou
  // "Talisman_Charm_Set_Small_PreTorment_Generic02_03" (genérico, de leveling)
  const set = id.match(/^Talisman_Charm_Set_(.+)_(\d+)$/i);
  const seal = id.match(/^Talisman_Seal_([A-Za-z]+)(?:_(\d+))?/i);
  const runeword = id.match(/^Runeword_(.+)$/i);
  if (runeword) {
    // palavra rúnica: "Runeword_Enigma", "Runeword_Infinity_Mace2H", "Runeword_Spirit_1HSword"
    item.kind = 'runeword';
    item.name = runewordName(runeword[1]);
    item.mythic = Boolean(raw?.mythic);
  } else if (set) {
    item.kind = 'set';
    item.set = setName(set[1]);
    item.name = `Conjunto ${item.set} (peça ${Number(set[2])})`;
  } else if (seal && !/_Unique_/i.test(id)) {
    item.kind = 'seal';
    item.rarity = seal[1].toLowerCase();
    item.variant = seal[2] ?? null; // MythicUnique_01/_02/_03 são selos diferentes
    item.name = `Selo ${RARITY_PT[item.rarity] ?? seal[1]}${item.variant ? ` ${item.variant}` : ''}`;
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
  }

  // Todos os aspectos da peça: lendário tem 1 (2 no amuleto); único/mítico pode
  // ter 1 no amuleto. Selo, conjunto do talismã e palavra rúnica não têm aspecto
  // de Códex. Em único, um nid que não é aspecto conhecido é ignorado (o planner
  // põe ids internos em armas únicas).
  if (item.kind === 'legendary' || item.kind === 'unique') {
    const aspects = (raw?.aspects ?? [])
      .map((a) => a?.nid)
      .filter((nid) => nid != null && nid !== 0)
      .map((nid) => resolveAspect(nid, comp))
      .filter((a) => item.kind === 'legendary' || !a.unknown);
    if (aspects.length) {
      item.aspects = aspects;
      if (item.kind === 'legendary') item.aspect = aspects[0]; // compatível com builds já importados
    }
  }

  const runes = (raw?.sockets ?? [])
    .filter((s) => typeof s === 'string' && /^Rune_/i.test(s))
    .map((s) => comp.runes?.[`Item_${s}`]?.name ?? prettifyId(s.replace(/^Rune_/, 'x_')));
  if (runes.length) item.runes = runes;
  return item;
}

const words = (text) => normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
const GENERIC_WORDS = new Set(['step', 'etapa', 'variant', 'build']);

/** Etapa cujo nome é o do perfil, ou está contido nele ("Midgame Selig" ⊇ "Midgame"), ou o contém ("Step 3 - Endgame"). */
function stepByName(steps, profileName) {
  const want = normalize(profileName);
  const exact = steps.findIndex((s) => normalize(s?.name) === want);
  if (exact >= 0) return exact;
  const pw = words(profileName).filter((w) => !GENERIC_WORDS.has(w) && !/^\d+$/.test(w));
  if (!pw.length) return -1;
  return steps.findIndex((s) => {
    const sw = words(s?.name).filter((w) => !GENERIC_WORDS.has(w) && !/^\d+$/.test(w));
    return sw.length > 0 && (sw.every((w) => pw.includes(w)) || pw.every((w) => sw.includes(w)));
  });
}

/** Etapa só de leveling: glifos no nível ≤ 1 (ex.: "Rush", "Step 1"). */
function isLevelingStep(step) {
  const levels = (step?.data ?? []).map((b) => Number(b?.glyphLevel) || 0);
  return levels.length > 0 && Math.max(...levels) <= 1;
}

/**
 * Etapa de Paragon de cada perfil. O planner guarda em cada perfil a lista de
 * etapas do build (Starter/Midgame/Endgame…, ou só "Step 1..4"), e
 * `paragon.position` não indica a fase. Regra:
 *  1. etapa com o mesmo nome do perfil (ou nome contido);
 *  2. leveling → 1ª etapa; variante (Push, Speedfarm…) → última;
 *  3. progressão: cada perfil tem uma posição (Starter=0, Midgame=1, Endgame=2;
 *     sem palavra-chave, a ordem entre os perfis de progressão). Se algum perfil
 *     de progressão da mesma lista de etapas casou pelo nome, ele vira âncora
 *     (ex.: "Step 3 - Endgame" = Endgame ⇒ Midgame é a etapa anterior); senão,
 *     conta a partir da 1ª etapa que não é só de leveling (glifo ≤ 1).
 * Devolve, para cada perfil, o índice da etapa (ou null sem etapas).
 */
function pickParagonSteps(profiles) {
  const list = profiles ?? [];
  const sigOf = (steps) => steps.map((s) => s?.name).join('\u0000');
  const rankOf = new Map([[0, 0], [100, 1], [200, 2]]);

  // posição de cada perfil de progressão dentro da sua lista de etapas
  const ordinal = new Map();
  const info = list.map((profile) => {
    const steps = profile?.paragon?.steps ?? [];
    const kind = classifyProfile(profile?.name);
    const sig = sigOf(steps);
    let rank = null;
    if (kind.role === 'progress') {
      const k = ordinal.get(sig) ?? 0;
      ordinal.set(sig, k + 1);
      rank = rankOf.get(kind.paragon) ?? k;
    }
    return { steps, sig, role: kind.role, rank, named: steps.length ? stepByName(steps, profile?.name) : -1 };
  });

  const maxRankOf = new Map();
  for (const it of info) if (it.rank != null) maxRankOf.set(it.sig, Math.max(maxRankOf.get(it.sig) ?? 0, it.rank));

  // âncoras: perfil de progressão que casou pelo nome → deslocamento etapa − posição
  const anchor = new Map();
  for (const it of info) {
    if (it.role === 'progress' && it.rank != null && it.named >= 0 && !anchor.has(it.sig)) anchor.set(it.sig, it.named - it.rank);
  }

  return info.map((it) => {
    const { steps } = it;
    if (!steps.length) return null;
    if (it.named >= 0) return it.named;
    if (it.role === 'leveling') return 0;
    if (it.role === 'variant') return steps.length - 1;
    const clamp = (i) => Math.max(0, Math.min(steps.length - 1, i));
    if (anchor.has(it.sig)) return clamp(anchor.get(it.sig) + it.rank);
    let eligible = steps.map((s, i) => i).filter((i) => !isLevelingStep(steps[i]));
    if (!eligible.length) eligible = steps.map((s, i) => i);
    // espalha as fases pelas etapas: com mais etapas que fases (ex.: 7 etapas "Spent N | G75"),
    // Starter fica na 1ª, Endgame na última e Midgame no meio
    const maxRank = Math.max(2, maxRankOf.get(it.sig) ?? 0);
    const pos = eligible.length <= maxRank + 1 ? Math.min(it.rank, eligible.length - 1) : Math.round((it.rank * (eligible.length - 1)) / maxRank);
    return eligible[Math.min(pos, eligible.length - 1)];
  });
}

function resolveParagon(profile, stepIndex, index) {
  const steps = profile?.paragon?.steps ?? [];
  const picked = stepIndex == null || !steps[stepIndex] ? null : { step: steps[stepIndex], index: stepIndex };
  if (!picked) return { boards: [], step: null };
  const comp = index.companion;
  const boards = (picked.step?.data ?? []).map((b) => ({
    board: comp.paragonBoards?.[b.id]?.name ?? b.id,
    boardPt: comp.paragonBoards?.[b.id]?.namePt ?? null,
    glyph: b.glyph ? (comp.paragonGlyphs?.[b.glyph]?.name ?? b.glyph) : null,
    glyphPt: b.glyph ? (comp.paragonGlyphs?.[b.glyph]?.namePt ?? null) : null,
    glyphLevel: Number(b.glyphLevel) || null,
    rotation: (((Number(b.rotation) || 0) % 4) + 4) % 4 * 90,
  }));
  return { boards, step: { name: picked.step?.name ?? null, index: picked.index, total: steps.length } };
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
  const aspectStep = (id, item, aspect) => ({
    id,
    text: `${item.slot}: ${pt(aspect.name, aspect.namePt)}${aspect.nameUncertain ? ' (nome a confirmar)' : ''} — ${aspectOrigin(aspect)}.`,
  });
  for (const item of loadout.items) {
    const base = `${phaseId}-i${item.slotKey}`;
    const aspects = item.aspects ?? (item.aspect ? [item.aspect] : []);
    if (item.kind === 'unique') {
      const where = item.boss ? ` — dropa de ${item.boss.name}` : '';
      const tags = [item.mythic ? 'Mítico' : null, item.charm ? 'poder no talismã' : null].filter(Boolean);
      steps.push({ id: base, text: `${item.slot}: ${pt(item.name, item.namePt)}${tags.length ? ` (${tags.join(', ')})` : ''}${where}.` });
      // aspecto no único (ex.: amuleto): passo próprio
      aspects.forEach((a, k) => { if (!a.unknown) steps.push(aspectStep(`${base}-a${k}`, item, a)); });
    } else if (item.kind === 'legendary') {
      // 1º aspecto mantém o id antigo do passo; os demais (2º do amuleto) ganham passo próprio
      aspects.forEach((a, k) => { if (!a.unknown) steps.push(aspectStep(k === 0 ? base : `${base}-a${k}`, item, a)); });
    } else if (item.kind === 'runeword') {
      steps.push({ id: base, text: `${item.slot}: palavra rúnica ${item.name}${item.mythic ? ' (Mítica)' : ''}.` });
    }
  }
  // selo mítico/único do talismã é item-chave (o lendário/raro é de leveling)
  const keySeal = loadout.items.find((it) => it.kind === 'seal' && /mythic|unique/.test(it.rarity ?? ''));
  if (keySeal) {
    // o id inclui qual selo é: trocar de selo no planner não herda o passo marcado
    const which = [keySeal.rarity, keySeal.variant].filter(Boolean).join('-');
    steps.push({ id: `${phaseId}-seal-${which}`, text: `${keySeal.slot}: ${keySeal.name}.` });
  }
  const sets = new Map();
  for (const it of loadout.items) if (it.kind === 'set') sets.set(it.set, (sets.get(it.set) ?? 0) + 1);
  for (const [name, count] of sets) {
    steps.push({ id: `${phaseId}-set-${normalize(name).replace(/\s+/g, '-')}`, text: `Talismã: ${count} peça${count > 1 ? 's' : ''} do conjunto ${name}.` });
  }
  const runes = [...new Set(loadout.items.flatMap((i) => i.runes ?? []))];
  if (runes.length) steps.push({ id: `${phaseId}-runes`, text: `Runas: ${runes.join(', ')}.` });
  if (loadout.paragon.length) {
    steps.push({ id: `${phaseId}-paragon`, text: `Paragon${paragonStepLabel(loadout.paragonStep)}: ${loadout.paragon.map(paragonBoardText).join(' · ')}.` });
  }
  return steps;
}

/** " (etapa Midgame, 2/3)" — qual etapa do planner a fase usa. */
function paragonStepLabel(step) {
  if (!step || step.total <= 1) return '';
  return ` (etapa ${step.name ? `${step.name}, ` : ''}${step.index + 1}/${step.total})`;
}

/** "Pertinaz [Espírito nv 50] (rotação 90°)" */
function paragonBoardText(p) {
  const glyph = p.glyph ? ` [${pt(p.glyph, p.glyphPt)}${p.glyphLevel ? ` nv ${p.glyphLevel}` : ''}]` : '';
  const rotation = p.rotation ? ` (rotação ${p.rotation}°)` : '';
  return `${pt(p.board, p.boardPt)}${glyph}${rotation}`;
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

  const paragonSteps = pickParagonSteps(data.profiles);
  const phases = data.profiles.map((profile, i) => {
    const id = `mx${i}`;
    const paragon = resolveParagon(profile, paragonSteps[i], index);
    const loadout = {
      skills: (profile.skillBar ?? []).filter(Boolean).map((sid) => ({ id: sid, name: index.skillById.get(sid)?.name ?? prettifyId(sid) })),
      items: Object.entries(profile.items ?? {})
        .filter(([, idx]) => items[idx])
        .map(([slotKey, idx]) => resolveItem(items[idx], slotKey, index))
        .sort((a, b) => a.slotKey - b.slotKey),
      paragon: paragon.boards,
      paragonStep: paragon.step,
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
  pickParagonSteps,
  runewordName,
  aspectOrigin,
  paragonBoardText,
  makeIndex,
  convertPlannerBuild,
};
