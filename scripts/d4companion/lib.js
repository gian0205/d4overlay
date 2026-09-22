'use strict';

/**
 * Funções puras para converter os arquivos de dados do Diablo4Companion
 * (https://github.com/josdemmers/Diablo4Companion, licença MIT) no formato
 * compacto usado pelo app: data/generated/d4companion.json.
 *
 * Cuidado: o Diablo4Companion agrupa entradas pelo TEXTO do poder, idioma por
 * idioma. Únicos diferentes com o mesmo poder viram uma entrada só (ex.:
 * Flameweaver e Bucrani's Grip), e um grupo de aspectos em inglês pode juntar
 * aspectos que em pt-BR são diferentes. Por isso:
 *  - o nome pt-BR de um único só é aceito quando o nome em inglês da entrada
 *    bate com o do nosso catálogo (data/generated/uniques.json);
 *  - aspectos são casados enUS↔ptBR por sno, nunca por grupo.
 */

const { normalize } = require('../../src/shared/text');

/** Ids que identificam o mesmo único (sem as variantes de talismã). */
function uniqueIds(entry) {
  const ids = new Set([...(entry.IdNameItemList ?? []), ...(entry.IdNameList ?? []), ...String(entry.IdName ?? '').split(';')].filter(Boolean));
  return [...ids].filter((id) => !id.startsWith('Talisman_Charm_Unique_'));
}

/**
 * Nomes com prefixo em pt-BR vêm com as variantes de gênero do jogo
 * ("[fs]Esmagadora[ms]Esmagador…") e o Diablo4Companion guarda só a feminina.
 * Como "Aspecto" é masculino, passa o adjetivo (1ª palavra) para o masculino.
 * Conferido contra os 88 nomes oficiais [ms] do jogo: 88/88.
 */
function masculinePt(name) {
  const parts = String(name ?? '').trim().split(' ');
  const [w, next] = parts;
  if (!w) return '';
  let out = w;
  if (/ista$/i.test(w)) out = w; // Oportunista: invariável
  else if (/dora$/i.test(w)) out = w.replace(/dora$/i, 'dor');
  else if (/eira$/i.test(w)) out = w.replace(/eira$/i, 'eiro');
  else if (/a$/i.test(w) && (parts.length === 1 || /^(em|na|no|de|da|do)$/i.test(next))) out = w.replace(/a$/i, 'o');
  return [out, ...parts.slice(1)].join(' ');
}

/** O jogo guarda só o "miolo" do nome do aspecto: "Bulwark's" / "of Redirected Force". */
function aspectFullName(name, lang) {
  const n = String(name ?? '').trim();
  if (!n) return n;
  if (lang === 'ptBR') {
    if (/^aspecto\b/i.test(n)) return n;
    return /^(d[oa]s?|de)\b/i.test(n) ? `Aspecto ${n}` : `Aspecto ${masculinePt(n)}`;
  }
  if (/\baspect\b/i.test(n)) return n;
  return /^of\b/i.test(n) ? `Aspect ${n}` : `${n} Aspect`;
}

/**
 * Limpa textos de poder: "#%#%" → "#%"; textos provisórios de desenvolvimento
 * ("(WIP) Need to replace…", "(PH) I need a new design!") viram null.
 */
function cleanPower(text) {
  if (text == null) return null;
  const t = String(text).replace(/(#%?)(?:#%?)+/g, '$1').trim();
  if (!t || /^[([]?\s*(?:WIP|PH)\s*[)\]]?(?:\s|$)/i.test(t)) return null;
  return t;
}

/** A zona do sigilo vem como "em Kehjistão" / "in Kehjistan"; "em " sozinho = sem zona. */
function cleanZone(text) {
  const t = String(text ?? '').trim();
  return /^(em|in)$/i.test(t) || !t ? null : t;
}

/** Nome que é só o id do item ("Helm Unique Druid 98"): string que faltou no jogo. */
function isPlaceholderName(name) {
  return /\bunique\b.*\b\d+\s*$/i.test(String(name ?? ''));
}

/** Texto de poder comparável: sem números, "#", "%" e marcação. */
function powerKey(text) {
  return normalize(String(text ?? '').replace(/[#%\d.,+\-]+/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * A entrada do D4C é do mesmo único do nosso catálogo? Pelo nome em inglês; se o
 * nome dela for só um id, pelo texto do poder.
 */
function sameUnique(ours, en) {
  if (normalize(ours.name) === normalize(en.Name)) return true;
  return isPlaceholderName(en.Name) && Boolean(ours.power) && powerKey(ours.power) === powerKey(en.Description);
}

function byKey(list, keyFn) {
  const map = new Map();
  for (const e of list ?? []) for (const k of [].concat(keyFn(e))) if (k != null && k !== '') map.set(k, e);
  return map;
}

/**
 * Masmorras que liberam aspectos no Códex: nome em inglês (com trim) →
 * sigilo enUS (Type "Dungeon") → IdSno → sigilo ptBR (nome e zona).
 * Não casa pelo nome em pt: há nomes pt repetidos para masmorras diferentes.
 */
function buildDungeonIndex(sigils) {
  const ptBySno = byKey(sigils?.ptBR, (e) => String(e.IdSno));
  const index = new Map();
  for (const en of sigils?.enUS ?? []) {
    if (en.Type !== 'Dungeon') continue;
    const key = String(en.Name ?? '').trim();
    if (!key || index.has(key)) continue;
    const pt = ptBySno.get(String(en.IdSno));
    index.set(key, {
      dungeon: key,
      dungeonPt: pt?.Name?.trim() || null,
      zone: cleanZone(en.DungeonZoneInfo),
      zonePt: cleanZone(pt?.DungeonZoneInfo),
    });
  }
  return index;
}

/**
 * Junta os arquivos enUS/ptBR em um só objeto indexado por id.
 * `files` = { Uniques: {enUS, ptBR}, Aspects, Runes, ParagonBoards, ParagonGlyphs, Sigils }
 * `catalog` (opcional) = Map<id do único, { name, power }> do nosso catálogo (em inglês).
 */
function buildCompanionData(files, { catalog } = {}) {
  const out = { uniques: {}, aspects: {}, runes: {}, paragonBoards: {}, paragonGlyphs: {} };
  const stats = { uniqueNameMismatch: [], uniqueNameAmbiguous: [], uniquePowerMismatch: [] };
  // entrada que junta itens diferentes do nosso catálogo (ids com 2+ nomes distintos)
  const fusedEntry = (entry) => {
    if (!catalog || !entry) return false;
    const names = new Set(uniqueIds(entry).map((id) => catalog.get(id)?.name).filter(Boolean).map(normalize));
    return names.size > 1;
  };

  // --- únicos ---
  // IdName pode juntar variantes ("A;S14_A"), então o ptBR é procurado por qualquer id
  const uniPt = byKey(files.Uniques.ptBR, (e) => [...String(e.IdName ?? '').split(';'), ...(e.IdNameList ?? [])]);
  const accepted = new Set();
  for (const en of files.Uniques.enUS) {
    const pt = [...String(en.IdName ?? '').split(';'), ...(en.IdNameList ?? [])].map((id) => uniPt.get(id)).find(Boolean);
    // grupo fundido em algum idioma: cada idioma escolheu o nome de um membro, sem
    // dizer qual — o nome pt não é confiável para nenhum dos ids (o poder é, pois é igual)
    const ambiguous = fusedEntry(en) || fusedEntry(pt);
    const namePt = pt?.Name && !isPlaceholderName(pt.Name) && !ambiguous ? pt.Name : null;
    for (const id of uniqueIds(en)) {
      const ours = catalog?.get(id);
      if (ours && !sameUnique(ours, en)) {
        // entrada fundida por texto igual: o NOME é de outro item, mas o D4C só funde
        // itens com o mesmo poder — então o poder pt-BR vale (se conferir com o nosso)
        if (!accepted.has(id)) {
          stats.uniqueNameMismatch.push(`${id}: nosso "${ours.name}", D4C "${en.Name}"`);
          const listed = [...(pt?.IdNameItemList ?? []), ...(pt?.IdNameList ?? [])].includes(id);
          if (listed && !out.uniques[id] && powerKey(ours.power) === powerKey(en.Description)) {
            out.uniques[id] = { name: ours.name, namePt: null, powerPt: cleanPower(pt?.Description) };
          }
        }
        continue;
      }
      if (accepted.has(id)) continue; // já casou; não sobrescreve
      if (ours && ambiguous && pt?.Name) stats.uniqueNameAmbiguous.push(`${id}: "${ours.name}" (grupo do D4C com outro item: pt "${pt.Name}")`);
      if (ours?.power && normalize(ours.name) === normalize(en.Name) && powerKey(ours.power) !== powerKey(en.Description)) {
        stats.uniquePowerMismatch.push(`${id}: "${ours.name}" — poder do nosso catálogo difere do texto do D4C`);
      }
      out.uniques[id] = {
        name: ours?.name ?? (isPlaceholderName(en.Name) ? null : en.Name),
        namePt,
        powerPt: cleanPower(pt?.Description),
      };
      if (ours) accepted.add(id);
    }
  }
  // o arquivo ptBR às vezes tem um único a mais que o enUS; sem nome em inglês para
  // conferir, só vale para ids que o nosso catálogo não conhece
  for (const ptEntry of files.Uniques.ptBR) {
    for (const id of uniqueIds(ptEntry)) {
      if (out.uniques[id] || catalog?.has(id) || isPlaceholderName(ptEntry.Name)) continue;
      out.uniques[id] = { name: null, namePt: ptEntry.Name, powerPt: cleanPower(ptEntry.Description) };
    }
  }
  // quem ficou sem nome pt porque a entrada era de outro item: nome em inglês do catálogo
  stats.uniqueNameMismatch = stats.uniqueNameMismatch.filter((line) => !accepted.has(line.split(':')[0]));

  // --- aspectos (por sno) ---
  const dungeons = buildDungeonIndex(files.Sigils);
  const aspPtBySno = byKey(files.Aspects.ptBR, (e) => (e.IdSnoList ?? [e.IdSno]).map(String));
  for (const en of files.Aspects.enUS) {
    const snos = (en.IdSnoList ?? [en.IdSno]).map(String);
    const mainPt = aspPtBySno.get(snos[0]);
    const origin = en.Dungeon ? dungeons.get(String(en.Dungeon).trim()) ?? { dungeon: String(en.Dungeon).trim() } : null;
    snos.forEach((sno, i) => {
      const pt = aspPtBySno.get(sno);
      // no pt-BR este sno é outro aspecto: o nome/poder em inglês do grupo não vale para ele
      const sameAspect = i === 0 || !pt || !mainPt || pt.Name === mainPt.Name;
      // fundido no pt-BR (com ou sem fusão no inglês): o pt escolheu o nome de um
      // membro do grupo, sem dizer qual
      const fusedPt = (pt?.IdSnoList ?? []).length > 1;
      const idName = (en.IdNameList ?? [])[i] ?? String(en.IdName ?? '').split(';')[i] ?? en.IdName;
      out.aspects[sno] = {
        id: idName,
        name: sameAspect ? aspectFullName(en.Name, 'enUS') : null,
        namePt: pt ? aspectFullName(pt.Name, 'ptBR') : null,
        power: sameAspect ? cleanPower(en.Description) : null,
        powerPt: cleanPower(pt?.Description),
        ...(fusedPt ? { nameUncertain: true } : {}),
        ...(origin ?? {}),
      };
    });
  }

  // --- runas ---
  const runePt = byKey(files.Runes.ptBR, (e) => e.IdName);
  for (const en of files.Runes.enUS) {
    const pt = runePt.get(en.IdName);
    out.runes[en.IdName] = {
      name: en.Name,
      type: en.RuneType ?? null,
      description: cleanPower(en.Description),
      descriptionPt: cleanPower(pt?.Description),
    };
  }

  // --- Paragon ---
  for (const kind of ['ParagonBoards', 'ParagonGlyphs']) {
    const pt = byKey(files[kind].ptBR, (e) => e.IdName);
    const key = kind === 'ParagonBoards' ? 'paragonBoards' : 'paragonGlyphs';
    for (const en of files[kind].enUS) out[key][en.IdName] = { name: en.Name, namePt: pt.get(en.IdName)?.Name ?? null };
  }
  return { data: out, stats };
}

module.exports = { uniqueIds, masculinePt, aspectFullName, cleanPower, cleanZone, isPlaceholderName, powerKey, buildDungeonIndex, buildCompanionData };
