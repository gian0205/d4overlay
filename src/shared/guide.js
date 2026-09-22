'use strict';

/**
 * Nível máximo de personagem; acima disso o progresso é medido em Paragon.
 */
const MAX_LEVEL = 70; // Lord of Hatred subiu o nível máximo de 60 para 70

/**
 * Retorna a fase do guia adequada ao personagem.
 * Fases definem `minLevel`/`maxLevel` e, para o endgame, `minParagon`.
 * Fases com `manual: true` (ex.: variantes "Push"/"Speedfarm" do Maxroll) só
 * aparecem quando o jogador as escolhe.
 */
function currentPhase(build, character = {}) {
  const all = build?.phases ?? [];
  if (all.length === 0) return null;
  const auto = all.filter((p) => !p.manual);
  const phases = auto.length ? auto : all;

  const level = Number(character.level) || 0;
  const paragon = Number(character.paragon) || 0;

  if (level >= MAX_LEVEL) {
    const endgame = phases
      .filter((p) => p.minParagon !== undefined && paragon >= p.minParagon)
      .sort((a, b) => b.minParagon - a.minParagon)[0];
    if (endgame) return endgame;
  }

  const byLevel = phases.find(
    (p) =>
      p.minParagon === undefined &&
      level >= (p.minLevel ?? 0) &&
      level <= (p.maxLevel ?? Infinity),
  );
  if (byLevel) return byLevel;

  return level < MAX_LEVEL ? phases[0] : phases[phases.length - 1];
}

/** Próximo passo não concluído da fase. */
function nextStep(phase, completed = []) {
  const done = new Set(completed);
  return (phase?.steps ?? []).find((s) => !done.has(s.id)) ?? null;
}

/** Percentual de passos concluídos em todo o build. */
function progress(build, completed = []) {
  const ids = (build?.phases ?? []).flatMap((p) => (p.steps ?? []).map((s) => s.id));
  if (ids.length === 0) return 0;
  const done = new Set(completed);
  return Math.round((ids.filter((id) => done.has(id)).length / ids.length) * 100);
}

module.exports = { MAX_LEVEL, currentPhase, nextStep, progress };
