'use strict';

/**
 * Consulta um tracker comunitário de eventos (World Boss, Helltide, Legion).
 * Não existe API oficial da Blizzard para o Diablo IV; o formato desses
 * trackers muda com frequência, então o parse é defensivo.
 */
function toMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function parseEvents(json) {
  if (!json || typeof json !== 'object') return null;
  const boss = json.boss ?? json.worldBoss ?? json.world_boss ?? null;
  const helltide = json.helltide ?? null;
  const legion = json.legion ?? null;
  return {
    worldBoss: boss
      ? {
          name: boss.name ?? boss.expectedName ?? null,
          zone: boss.zone ?? boss.location ?? null,
          territory: boss.territory ?? null,
          at: toMs(boss.expected ?? boss.timestamp ?? boss.time),
        }
      : null,
    helltide: helltide ? { at: toMs(helltide.timestamp ?? helltide.expected ?? helltide.time) } : null,
    legion: legion ? { at: toMs(legion.expected ?? legion.timestamp ?? legion.time) } : null,
  };
}

class WorldEvents {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.timer = null;
  }

  start(url, intervalMs = 60_000) {
    this.stop();
    if (!url) return;
    const tick = async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.onUpdate({ ok: true, events: parseEvents(await res.json()) });
      } catch (err) {
        this.onUpdate({ ok: false, error: String(err.message ?? err) });
      }
    };
    tick();
    this.timer = setInterval(tick, intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { WorldEvents, parseEvents };
