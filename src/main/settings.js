'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  selectedBuildId: null,
  manualClassId: null,
  manualLevel: null,
  manualParagon: null,
  completedSteps: {},
  remoteDataUrl: '',
  worldEventsUrl: 'https://d4armory.io/api/events.json',
  autoOpenBossPanel: true,
  bounds: { width: 380, height: 620, x: null, y: null },
};

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.data = { ...DEFAULTS };
    try {
      this.data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      // primeira execução ou arquivo corrompido: usa os padrões
    }
  }

  get() {
    return structuredClone(this.data);
  }

  update(patch) {
    this.data = { ...this.data, ...patch };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    return this.get();
  }

  toggleStep(buildId, stepId) {
    const completed = new Set(this.data.completedSteps[buildId] ?? []);
    if (completed.has(stepId)) completed.delete(stepId);
    else completed.add(stepId);
    return this.update({
      completedSteps: { ...this.data.completedSteps, [buildId]: [...completed] },
    });
  }
}

module.exports = { Settings };
