'use strict';

/**
 * Funções puras para converter os arquivos de dados do Diablo4Companion
 * (https://github.com/josdemmers/Diablo4Companion, licença MIT) no formato
 * compacto usado pelo app: data/generated/d4companion.json.
 */

/** Ids que identificam o mesmo único (sem as variantes de talismã). */
function uniqueIds(entry) {
  const ids = new Set([...(entry.IdNameList ?? []), ...(entry.IdNameItemList ?? []), entry.IdName].filter(Boolean));
  return [...ids].filter((id) => !id.startsWith('Talisman_Charm_Unique_'));
}

/** O jogo guarda só o "miolo" do nome do aspecto: "Bulwark's" / "of Redirected Force". */
function aspectFullName(name, lang) {
  const n = String(name ?? '').trim();
  if (!n) return n;
  if (lang === 'ptBR') return /^aspecto\b/i.test(n) ? n : `Aspecto ${n}`;
  if (/\baspect\b/i.test(n)) return n;
  return /^of\b/i.test(n) ? `Aspect ${n}` : `${n} Aspect`;
}

function byKey(list, keyFn) {
  const map = new Map();
  for (const e of list ?? []) for (const k of [].concat(keyFn(e))) if (k) map.set(k, e);
  return map;
}

/**
 * Junta os arquivos enUS/ptBR em um só objeto indexado por id.
 * `files` = { Uniques: {enUS, ptBR}, Aspects: {...}, Runes: {...}, ParagonBoards: {...}, ParagonGlyphs: {...} }
 */
function buildCompanionData(files) {
  const out = { uniques: {}, aspects: {}, runes: {}, paragonBoards: {}, paragonGlyphs: {} };

  // IdName pode juntar variantes ("A;S14_A"), então o ptBR é procurado por qualquer id
  const uniPt = byKey(files.Uniques.ptBR, (e) => [e.IdName, ...(e.IdNameList ?? [])]);
  for (const en of files.Uniques.enUS) {
    const pt = [en.IdName, ...(en.IdNameList ?? [])].map((id) => uniPt.get(id)).find(Boolean);
    const entry = { name: en.Name, namePt: pt?.Name ?? null, powerPt: pt?.Description ?? null };
    for (const id of uniqueIds(en)) out.uniques[id] = entry;
  }
  // às vezes o arquivo ptBR tem um único a mais que o enUS; o nome em inglês vem do catálogo do jogo
  for (const ptEntry of files.Uniques.ptBR) {
    for (const id of uniqueIds(ptEntry)) {
      if (!out.uniques[id]) out.uniques[id] = { name: null, namePt: ptEntry.Name, powerPt: ptEntry.Description ?? null };
    }
  }

  const aspPt = byKey(files.Aspects.ptBR, (e) => [e.IdName, ...(e.IdNameList ?? [])]);
  for (const en of files.Aspects.enUS) {
    const pt = [en.IdName, ...(en.IdNameList ?? [])].map((id) => aspPt.get(id)).find(Boolean);
    const entry = {
      id: en.IdName,
      name: aspectFullName(en.Name, 'enUS'),
      namePt: pt ? aspectFullName(pt.Name, 'ptBR') : null,
      power: en.Description ?? null,
      powerPt: pt?.Description ?? null,
      codex: Boolean(en.IsCodex),
      dungeon: en.Dungeon || null,
      seasonal: Boolean(en.IsSeasonal),
    };
    for (const sno of en.IdSnoList ?? [en.IdSno]) out.aspects[sno] = entry;
  }

  const runePt = byKey(files.Runes.ptBR, (e) => e.IdName);
  for (const en of files.Runes.enUS) {
    const pt = runePt.get(en.IdName);
    out.runes[en.IdName] = {
      name: en.Name,
      type: en.RuneType ?? null,
      description: en.Description ?? null,
      descriptionPt: pt?.Description ?? null,
    };
  }

  for (const kind of ['ParagonBoards', 'ParagonGlyphs']) {
    const pt = byKey(files[kind].ptBR, (e) => e.IdName);
    const key = kind === 'ParagonBoards' ? 'paragonBoards' : 'paragonGlyphs';
    for (const en of files[kind].enUS) out[key][en.IdName] = { name: en.Name, namePt: pt.get(en.IdName)?.Name ?? null };
  }
  return out;
}

module.exports = { uniqueIds, aspectFullName, buildCompanionData };
