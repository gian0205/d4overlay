'use strict';

/**
 * Lê o d4data baixado por sync.js e gera:
 *   data/generated/uniques.json  catálogo de únicos (nome, classes, slot, poder, mítico)
 *   data/generated/skills.json   skills ativas por classe
 *
 * Uso: node scripts/d4data/extract.js [--dir .cache/d4data] [--out data/generated]
 *
 * Observação: as tabelas de loot por boss NÃO existem nos arquivos do cliente
 * (o sorteio é feito no servidor). O catálogo serve para validar/enriquecer
 * data/bosses.json com classe e poder de cada item.
 */

const fs = require('fs');
const path = require('path');
const lib = require('./lib');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const root = path.join(__dirname, '..', '..');
const dir = path.resolve(arg('dir', path.join(root, '.cache', 'd4data')));
const out = path.resolve(arg('out', path.join(root, 'data', 'generated')));

const META = path.join(dir, 'json', 'base', 'meta');
const STRINGS = path.join(dir, 'json', 'enUS_Text', 'meta', 'StringList');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function strings(name) {
  const json = readJson(path.join(STRINGS, `${name}.stl.json`));
  return json ? lib.stringMap(json) : null;
}

function extractUniques() {
  const itemDir = path.join(META, 'Item');
  const entries = [];
  for (const file of fs.readdirSync(itemDir)) {
    if (!file.includes('_Unique_') || !file.endsWith('.itm.json')) continue;
    const id = file.replace('.itm.json', '');
    const item = readJson(path.join(itemDir, file));
    const affixStrings = lib
      .powerAffixNames(id, item)
      .map((name) => strings(`Affix_${name}`))
      .find((s) => s?.Desc);
    const unique = lib.buildUnique({ id, item, nameStrings: strings(`Item_${id}`), affixStrings });
    if (unique) entries.push(unique);
  }
  return lib.dedupeUniques(entries);
}

function extractSkills() {
  const result = {};
  for (const [classId, file] of Object.entries(lib.SKILLKIT_FILES)) {
    const kit = readJson(path.join(META, 'SkillKit', `${file}.skl.json`));
    result[classId] = lib.buildSkills(kit, (powerId) => strings(`Power_${powerId}`));
  }
  return result;
}

function main() {
  if (!fs.existsSync(META)) {
    console.error(`d4data não encontrado em ${dir}. Rode antes: npm run d4data:sync`);
    process.exit(1);
  }
  const build = fs.readFileSync(path.join(dir, 'buildVersion.txt'), 'utf8').trim();
  const meta = { build, source: 'https://github.com/DiabloTools/d4data', generatedAt: new Date().toISOString() };

  const uniques = extractUniques();
  const skills = extractSkills();

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'uniques.json'), `${JSON.stringify({ ...meta, uniques }, null, 1)}\n`);
  fs.writeFileSync(path.join(out, 'skills.json'), `${JSON.stringify({ ...meta, classes: skills }, null, 1)}\n`);

  const perClass = Object.fromEntries(Object.entries(skills).map(([c, s]) => [c, s.length]));
  console.log(`build ${build}: ${uniques.length} únicos (${uniques.filter((u) => u.mythic).length} míticos)`);
  console.log('skills por classe:', perClass);
}

main();
