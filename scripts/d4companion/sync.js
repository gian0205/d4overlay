'use strict';

/**
 * Baixa os dados do Diablo4Companion (nomes em português, aspectos, runas e
 * tabuleiros de Paragon) e gera data/generated/d4companion.json.
 * Uso: npm run d4companion
 */
const fs = require('fs');
const path = require('path');
const { buildCompanionData } = require('./lib');

const REPO = 'josdemmers/Diablo4Companion';
const BRANCH = 'master';
const KINDS = ['Uniques', 'Aspects', 'Runes', 'ParagonBoards', 'ParagonGlyphs'];
const LANGS = ['enUS', 'ptBR'];
const OUT = path.join(__dirname, '..', '..', 'data', 'generated', 'd4companion.json');

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const commit = await getJson(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`)
    .then((c) => ({ sha: c.sha, date: c.commit?.committer?.date }))
    .catch(() => ({ sha: BRANCH, date: null }));

  const files = {};
  for (const kind of KINDS) {
    files[kind] = {};
    for (const lang of LANGS) {
      const url = `https://raw.githubusercontent.com/${REPO}/${commit.sha}/D4Companion/Data/${kind}.${lang}.json`;
      files[kind][lang] = await getJson(url);
      console.log(`baixado ${kind}.${lang} (${files[kind][lang].length})`);
    }
  }

  const data = buildCompanionData(files);
  const result = {
    source: `https://github.com/${REPO} (MIT)`,
    commit: commit.sha,
    commitDate: commit.date,
    generatedAt: new Date().toISOString(),
    ...data,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result));
  const count = (o) => Object.keys(o).length;
  console.log(`gerado ${path.relative(process.cwd(), OUT)}: ${count(data.uniques)} ids de únicos, ${count(data.aspects)} aspectos, ${count(data.runes)} runas, ${count(data.paragonBoards)} tabuleiros`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
