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
const KINDS = ['Uniques', 'Aspects', 'Runes', 'ParagonBoards', 'ParagonGlyphs', 'Sigils'];
const LANGS = ['enUS', 'ptBR'];
const GENERATED = path.join(__dirname, '..', '..', 'data', 'generated');
const OUT = path.join(GENERATED, 'd4companion.json');

/** Nomes/poderes em inglês do nosso catálogo (npm run d4data), para conferir os nomes pt-BR. */
function loadCatalog() {
  try {
    const { uniques } = JSON.parse(fs.readFileSync(path.join(GENERATED, 'uniques.json'), 'utf8'));
    return new Map(uniques.map((u) => [u.id, { name: u.name, power: u.power }]));
  } catch {
    console.warn('aviso: data/generated/uniques.json ausente — nomes pt-BR dos únicos não serão conferidos (rode npm run d4data)');
    return undefined;
  }
}

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

  const { data, stats } = buildCompanionData(files, { catalog: loadCatalog() });
  for (const line of stats.uniqueNameMismatch) console.log(`sem nome pt-BR (entrada do D4C é de outro item; poder pt mantido se conferir): ${line}`);
  for (const line of stats.uniqueNameAmbiguous) console.log(`sem nome pt-BR (grupo fundido): ${line}`);
  for (const line of stats.uniquePowerMismatch) console.log(`aviso: ${line} (rode npm run d4data ou confira o texto)`);
  const uncertain = Object.entries(data.aspects).filter(([, a]) => a.nameUncertain).map(([sno, a]) => `${sno} ${a.namePt ?? a.name}`);
  if (uncertain.length) console.log(`aspectos com nome a confirmar (grupo fundido no pt-BR): ${uncertain.join(', ')}`);
  const result = {
    source: `https://github.com/${REPO} (MIT)`,
    commit: commit.sha,
    commitDate: commit.date,
    generatedAt: new Date().toISOString(),
    ...data,
  };
  fs.mkdirSync(GENERATED, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result));
  const count = (o) => Object.keys(o).length;
  console.log(`gerado ${path.relative(process.cwd(), OUT)}: ${count(data.uniques)} ids de únicos, ${count(data.aspects)} aspectos, ${count(data.runes)} runas, ${count(data.paragonBoards)} tabuleiros`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
