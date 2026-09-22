'use strict';

/**
 * Baixa só as partes do DiabloTools/d4data que o leitor usa.
 * O repositório completo tem ~870 mil arquivos; aqui usamos clone parcial
 * (--filter=blob:none) + sparse checkout, o que baixa algumas dezenas de MB.
 *
 * Uso: node scripts/d4data/sync.js [--dir .cache/d4data] [--ref master]
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'https://github.com/DiabloTools/d4data.git';

// Padrões no formato .gitignore (sparse checkout "no-cone").
const SPARSE_PATTERNS = [
  '/buildVersion.txt',
  '/json/base/meta/PlayerClass/',
  '/json/base/meta/SkillKit/',
  '/json/base/meta/ItemType/',
  '/json/base/meta/Item/*_Unique_*',
  '/json/enUS_Text/meta/StringList/Item_*_Unique_*',
  '/json/enUS_Text/meta/StringList/Affix_*',
  '/json/enUS_Text/meta/StringList/ItemType_*',
  '/json/enUS_Text/meta/StringList/Power_*',
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'inherit' });
}

function main() {
  const dir = path.resolve(arg('dir', path.join(__dirname, '..', '..', '.cache', 'd4data')));
  const ref = arg('ref', 'master');

  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    git(['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--branch', ref, REPO, dir]);
  } else {
    git(['fetch', '--filter=blob:none', '--depth', '1', 'origin', ref], dir);
    git(['reset', '--soft', 'FETCH_HEAD'], dir);
  }

  git(['sparse-checkout', 'init', '--no-cone'], dir);
  fs.writeFileSync(path.join(dir, '.git', 'info', 'sparse-checkout'), `${SPARSE_PATTERNS.join('\n')}\n`);
  git(['read-tree', '-mu', 'HEAD'], dir);

  const version = fs.readFileSync(path.join(dir, 'buildVersion.txt'), 'utf8').trim();
  console.log(`d4data sincronizado em ${dir} (build ${version})`);
}

main();
