'use strict';

const fs = require('fs');
const path = require('path');
const { validateData } = require('../shared/validate');

const BUNDLED_DIR = path.join(__dirname, '..', '..', 'data');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Carrega bosses/builds. Ordem de prioridade:
 *  1. cache baixado da URL remota (userData/data-cache.json), se válido;
 *  2. arquivos em data/ empacotados com o app.
 * A URL remota deve apontar para um JSON { "bosses": <bosses.json>, "builds": <builds.json> }.
 */
class DataStore {
  constructor(userDataDir) {
    this.cacheFile = path.join(userDataDir, 'data-cache.json');
    this.data = this.loadLocal();
  }

  loadBundled() {
    return {
      bosses: readJson(path.join(BUNDLED_DIR, 'bosses.json')),
      builds: readJson(path.join(BUNDLED_DIR, 'builds.json')),
      source: 'bundled',
    };
  }

  loadLocal() {
    try {
      const cached = readJson(this.cacheFile);
      if (validateData(cached).length === 0) return { ...cached, source: 'cache' };
    } catch {
      // sem cache
    }
    return this.loadBundled();
  }

  async refreshFromRemote(url) {
    if (!url) return { ok: false, error: 'URL remota não configurada' };
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const remote = await res.json();
      const errors = validateData(remote);
      if (errors.length) throw new Error(`dados inválidos: ${errors.slice(0, 3).join('; ')}`);
      fs.writeFileSync(this.cacheFile, JSON.stringify(remote));
      this.data = { ...remote, source: 'remote' };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err.message ?? err) };
    }
  }

  get() {
    return this.data;
  }
}

module.exports = { DataStore };
