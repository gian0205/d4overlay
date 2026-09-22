'use strict';

/**
 * Funções puras para ler os JSON do DiabloTools/d4data.
 * Mantidas separadas do I/O para serem testadas sem o repositório baixado.
 */

/** Ordem do array `fUsableByClass` dos itens (descoberta nos próprios dados). */
const CLASS_MASK_ORDER = [
  'sorcerer',
  'druid',
  'barbarian',
  'rogue',
  'necromancer',
  'spiritborn',
  'paladin',
  'warlock',
];

/** Nome do arquivo SkillKit de cada classe. */
const SKILLKIT_FILES = {
  barbarian: 'Barbarian',
  druid: 'Druid',
  necromancer: 'Necromancer',
  rogue: 'Rogue',
  sorcerer: 'Sorcerer',
  spiritborn: 'Spiritborn',
  paladin: 'Paladin_NEW',
  warlock: 'Warlock',
};

const SLOT_PT = {
  Helm: 'Elmo',
  ChestArmor: 'Peitoral',
  Gloves: 'Luvas',
  Legs: 'Calças',
  Boots: 'Botas',
  Amulet: 'Amuleto',
  Ring: 'Anel',
  Shield: 'Escudo',
  FocusBookOffHand: 'Foco',
  Focus: 'Foco',
  OffHandTotem: 'Totem',
  Sword: 'Espada',
  Sword2H: 'Espada de 2 mãos',
  Axe: 'Machado',
  Axe2H: 'Machado de 2 mãos',
  Mace: 'Maça',
  Mace2H: 'Maça de 2 mãos',
  Dagger: 'Adaga',
  Wand: 'Varinha',
  Staff: 'Cajado',
  Quarterstaff: 'Bordão',
  Polearm: 'Arma de haste',
  Glaive: 'Glaive',
  Scythe: 'Foice',
  Scythe2H: 'Foice de 2 mãos',
  Bow: 'Arco',
  Crossbow2H: 'Besta',
  Flail: 'Mangual',
};

/** Tipos de item que não são equipamento (peixes, amuletos de coleção etc.). */
const EQUIPMENT_TYPES = new Set(Object.keys(SLOT_PT));

const PLACEHOLDER = /\[ph|\(ph\)|\bph\b|template|boost|test/i;

/** Converte `fUsableByClass` em ids de classe. Todas as classes → [] (genérico). */
function classesFromMask(mask) {
  if (!Array.isArray(mask)) return [];
  const classes = CLASS_MASK_ORDER.filter((_, i) => mask[i]);
  return classes.length === CLASS_MASK_ORDER.length ? [] : classes;
}

/** Lê um StringList (`arStrings`) como mapa label → texto. */
function stringMap(stringList) {
  const map = {};
  for (const entry of stringList?.arStrings ?? []) map[entry.szLabel] = entry.szText;
  return map;
}

/**
 * Remove a marcação dos textos do jogo:
 *  - `{if:X}a{else}b{/if}` → b (versão não-mítica) e `{if:X}a{/if}` → ''
 *  - fórmulas `[ ... ]` e `{payload:...}` → '#'
 *  - tags de formatação (`{c_x}`, `{/c}`, `{u}`, `{b}`) e ícones são removidos
 */
function cleanGameText(text) {
  if (!text) return '';
  let out = String(text).replace(/\r/g, '');

  // resolve condicionais de dentro para fora
  const conditional = /\{if:[^{}]*\}((?:(?!\{if:)[\s\S])*?)(?:\{else\}((?:(?!\{if:)[\s\S])*?))?\{\/if\}/;
  for (let i = 0; i < 50 && conditional.test(out); i++) {
    out = out.replace(conditional, (_m, _then, otherwise) => otherwise ?? '');
  }

  return out
    // plural do jogo: "# |4second:seconds;" → "# seconds"
    .replace(/\|\d*([^:|;\n]*):([^;\n]*);/g, '$2')
    // fórmula: "[Affix_Value_1|%+|]" → "#%" (mantém o % como o texto do jogo mostra)
    .replace(/\[([^\]]*)\]/g, (_m, inner) => (/\|[^|]*%/.test(inner) ? '#%' : '#'))
    .replace(/\{payload:[^}]*\}/g, '#')
    .replace(/\{icon:[^}]*\}/g, '')
    // formatação: {c_important}, {/c}, {c:FF00FF00}, {u}, {b}…
    .replace(/\{\/?(?:c(?:_\w+)?|c:[0-9a-f]+|u|b)\s*\}/gi, '')
    // condicional órfão no texto do jogo (ex.: "…Dexterity.{/c_mythic}{/if}")
    .replace(/\{(?:\/if|else|if:[^}]*)\}/gi, '')
    .replace(/\{[^}]*\}/g, '#')
    .replace(/#(?:\s*#)+/g, '#')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Monta a entrada de catálogo de um único a partir dos arquivos do d4data.
 * Retorna null para itens que não são únicos jogáveis (placeholders, peixes, charms…).
 */
function buildUnique({ id, item, nameStrings, affixStrings }) {
  const name = nameStrings?.Name?.trim();
  if (!name || PLACEHOLDER.test(name) || PLACEHOLDER.test(id)) return null;
  // variantes de transmog (S10_), Crucible (S12_), talismãs e peixes
  if (/^(S10_|S12_|Talisman_|X\d_Fish)/.test(id)) return null;
  const slot = item?.snoItemType?.name ?? null;
  if (!EQUIPMENT_TYPES.has(slot)) return null;
  const power = cleanGameText(affixStrings?.Desc);
  if (!power) return null;

  return {
    id,
    name,
    classes: classesFromMask(item.fUsableByClass),
    slot,
    slotPt: SLOT_PT[slot],
    mythic: item.eMagicType === 4,
    power,
    flavor: nameStrings.Flavor ? cleanGameText(nameStrings.Flavor) : undefined,
  };
}

/**
 * O poder da unique fica num Affix. Normalmente `Affix_<id>`, mas alguns itens
 * (ex.: Infernal Hordes, Azurewrath) apontam para outro affix em `arForcedAffixes`.
 */
function powerAffixNames(id, item) {
  const forced = (item?.arForcedAffixes ?? []).map((a) => a?.name).filter(Boolean);
  // versão atual do poder: affix forçado "<id>_xN" (ex.: 2HSword_Unique_Barb_002_x2),
  // que substitui o Affix_<id> antigo (hoje usado pela versão do Crisol/S12)
  const revised = forced.filter((n) => n.toLowerCase().startsWith(`${String(id).toLowerCase()}_x`)).sort().reverse();
  return [...revised, id, ...forced.filter((n) => !revised.includes(n))];
}

/** Mesma unique em mais de um arquivo (_x1/_x2): junta classes e mantém o primeiro. */
function dedupeUniques(list) {
  const byName = new Map();
  for (const u of list) {
    const prev = byName.get(u.name);
    if (!prev) {
      byName.set(u.name, { ...u });
      continue;
    }
    if (prev.classes.length && u.classes.length) {
      prev.classes = [...new Set([...prev.classes, ...u.classes])];
    } else {
      prev.classes = [];
    }
    prev.mythic = prev.mythic || u.mythic;
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Lista de skills ativas de uma classe a partir do SkillKit + StringLists de Power. */
function buildSkills(skillKit, powerStrings) {
  const skills = [];
  const seen = new Set();
  for (const entry of skillKit?.arActiveSkillEntries ?? []) {
    const powerId = entry.snoPower?.name;
    if (!powerId || seen.has(powerId)) continue;
    const strings = powerStrings(powerId);
    const name = strings?.name?.trim();
    if (!name || PLACEHOLDER.test(name)) continue;
    seen.add(powerId);
    skills.push({ id: powerId, name, description: cleanGameText(strings.desc) });
  }
  return skills;
}

module.exports = {
  CLASS_MASK_ORDER,
  SKILLKIT_FILES,
  SLOT_PT,
  classesFromMask,
  stringMap,
  cleanGameText,
  buildUnique,
  powerAffixNames,
  dedupeUniques,
  buildSkills,
};
