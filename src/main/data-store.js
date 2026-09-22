'use strict';

const fs = require('fs');
const path = require('path');
const { validateData } = require('../shared/validate');
const { enrichBosses } = require('../shared/catalog');
const { PLANNER_API, parsePlannerId, makeIndex, convertPlannerBuild } = require('../shared/maxroll');

const BUNDLED_DIR = path.join(__dirname, '..', '..', 'data');
const GENERATED_DIR = path.join(BUNDLED_DIR, 'generated');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function tryReadJson(file) {
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

/**
 * Catálogo extraído dos arquivos do jogo (npm run d4data) e dados do
 * Diablo4Companion (npm run d4companion: nomes em português, aspectos, runas,
 * Paragon). Ambos opcionais.
 */
function loadCatalog() {
  const uniques = tryReadJson(path.join(GENERATED_DIR, 'uniques.json'));
  const skills = tryReadJson(path.join(GENERATED_DIR, 'skills.json'));
  const companion = tryReadJson(path.join(GENERATED_DIR, 'd4companion.json'));
  if (!uniques && !skills && !companion) return null;
  return {
    build: uniques?.build ?? null,
    uniques: uniques?.uniques ?? [],
    skills: skills?.classes ?? {},
    companion,
  };
}

/**
 * Carrega bosses/builds. Ordem de prioridade:
 *  1. cache baixado da URL remota (userData/data-cache.json), se válido;
 *  2. arquivos em data/ empacotados com o app.
 * A URL remota deve apontar para um JSON { "bosses": <bosses.json>, "builds": <builds.json> }.
 * Builds importados do Maxroll ficam à parte (userData/imported-builds.json)
 * e são somados à lista.
 */
class DataStore {
  constructor(userDataDir) {
    this.cacheFile = path.join(userDataDir, 'data-cache.json');
    this.importedFile = path.join(userDataDir, 'imported-builds.json');
    this.catalog = loadCatalog();
    this.data = this.loadLocal();
    this.imported = this.loadImported();
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

  loadImported() {
    const list = tryReadJson(this.importedFile);
    return Array.isArray(list) ? list : [];
  }

  saveImported() {
    fs.mkdirSync(path.dirname(this.importedFile), { recursive: true });
    fs.writeFileSync(this.importedFile, JSON.stringify(this.imported, null, 2));
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

  /** Baixa um build do planner do Maxroll (id ou URL) e guarda na lista de importados. */
  async importMaxroll(input) {
    const plannerId = parsePlannerId(input);
    if (!plannerId) return { ok: false, error: 'Cole o link do planner (maxroll.gg/d4/planner/…) ou o id do build.' };
    try {
      const res = await fetch(`${PLANNER_API}${plannerId}`, { signal: AbortSignal.timeout(20000) });
      if (res.status === 404) throw new Error('build não encontrado no Maxroll');
      if (!res.ok) throw new Error(`Maxroll respondeu HTTP ${res.status}`);
      const index = makeIndex({
        skills: this.catalog?.skills,
        uniques: this.catalog?.uniques,
        companion: this.catalog?.companion,
        bosses: this.data.bosses,
      });
      const build = convertPlannerBuild(await res.json(), index);
      const errors = validateData({ bosses: { bosses: [] }, builds: { builds: [build] } });
      if (errors.length) throw new Error(errors[0]);
      this.imported = [...this.imported.filter((b) => b.id !== build.id), build];
      this.saveImported();
      return { ok: true, build: { id: build.id, name: build.name, classId: build.classId } };
    } catch (err) {
      return { ok: false, error: String(err.message ?? err) };
    }
  }

  removeImported(buildId) {
    this.imported = this.imported.filter((b) => b.id !== buildId);
    this.saveImported();
  }

  /** Dados prontos para a UI: drops completados com o catálogo do jogo e builds importados somados. */
  get() {
    const baseIds = new Set((this.data.builds?.builds ?? []).map((b) => b.id));
    return {
      ...this.data,
      bosses: enrichBosses(this.data.bosses, this.catalog?.uniques, this.catalog?.companion),
      builds: {
        ...this.data.builds,
        builds: [...(this.data.builds?.builds ?? []), ...this.imported.filter((b) => !baseIds.has(b.id))],
      },
      catalog: this.catalog
        ? {
            build: this.catalog.build,
            skills: this.catalog.skills,
            companion: this.catalog.companion ? { commit: this.catalog.companion.commit, commitDate: this.catalog.companion.commitDate } : null,
          }
        : null,
    };
  }
}

module.exports = { DataStore };
