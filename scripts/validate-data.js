'use strict';

const path = require('path');
const fs = require('fs');
const { validateData } = require('../src/shared/validate');
const { catalogWarnings } = require('../src/shared/catalog');

const dataDir = path.join(__dirname, '..', 'data');
const data = {
  bosses: require(path.join(dataDir, 'bosses.json')),
  builds: require(path.join(dataDir, 'builds.json')),
};

const errors = validateData(data);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const generated = path.join(dataDir, 'generated');
if (fs.existsSync(path.join(generated, 'uniques.json'))) {
  const warnings = catalogWarnings(data, {
    uniques: require(path.join(generated, 'uniques.json')).uniques,
    skills: require(path.join(generated, 'skills.json')).classes,
  });
  for (const w of warnings) console.warn(`aviso: ${w}`);
  if (process.argv.includes('--strict') && warnings.length) process.exit(1);
}
console.log('Dados OK');
