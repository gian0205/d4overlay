'use strict';

const path = require('path');
const { validateData } = require('../src/shared/validate');

const dataDir = path.join(__dirname, '..', 'data');
const errors = validateData({
  bosses: require(path.join(dataDir, 'bosses.json')),
  builds: require(path.join(dataDir, 'builds.json')),
});

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Dados OK');
