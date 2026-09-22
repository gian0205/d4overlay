'use strict';

/* global d4 */

const logic = d4.logic;
const TIER_LABEL = { initiate: 'Initiate', greater: 'Greater', special: 'Especiais', pinnacle: 'Pináculo' };

const state = {
  mode: new URLSearchParams(location.search).get('mode') ?? 'overlay',
  tab: 'boss',
  data: null,
  settings: null,
  game: null,
  detectedBossId: null,
  viewBossId: null,
  viewPhaseId: null,
  interactive: true,
  hotkeys: [],
  overwolf: false,
  worldEvents: null,
};

/** Cria elementos: h('div', { class: 'x', onclick }, ...filhos). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    // via CSSOM: a CSP bloqueia o atributo style inline
    else if (key === 'style') el.style.cssText = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// ---------- dados derivados ----------

function hasGameData() {
  return Boolean(state.game?.running && state.game.character.level);
}

function character() {
  if (hasGameData()) return state.game.character;
  return {
    classId: state.settings.manualClassId,
    level: state.settings.manualLevel,
    paragon: state.settings.manualParagon,
  };
}

function activeClassId() {
  return (hasGameData() && state.game.character.classId) || state.settings.manualClassId;
}

function bosses() {
  return state.data?.bosses?.bosses ?? [];
}

function builds() {
  return state.data?.builds?.builds ?? [];
}

function selectedBuild() {
  return builds().find((b) => b.id === state.settings.selectedBuildId) ?? null;
}

/** Nome/poder no idioma escolhido (português quando disponível). */
function label(en, ptText) {
  return (state.settings?.ptNames && ptText ? ptText : en) ?? ptText;
}

/** Nome principal + original entre parênteses quando está traduzido (útil para buscar no trade/guias). */
function itemName(en, ptText) {
  const shown = label(en, ptText);
  return shown !== en && en ? [shown, h('span', { class: 'muted' }, ` (${en})`)] : shown;
}

async function saveSettings(patch) {
  state.settings = await d4.updateSettings(patch);
  render();
}

// ---------- cabeçalho ----------

function renderHeader() {
  const c = character();
  const charEl = document.getElementById('character');
  if (hasGameData()) {
    const paragon = c.paragon ? ` · P${c.paragon}` : '';
    charEl.textContent = `${c.name ?? ''} ${logic.className(c.classId) ?? ''} nv ${c.level}${paragon}`.trim();
  } else if (state.game?.running) {
    charEl.textContent = 'Diablo IV detectado — aguardando dados…';
  } else {
    charEl.textContent = state.overwolf ? 'Diablo IV não detectado' : 'Modo manual (sem dados do jogo)';
  }

  const loc = state.game?.location;
  document.getElementById('location').textContent =
    loc?.area || loc?.territory ? [loc.area, loc.territory].filter(Boolean).join(' · ') : '';

  const btn = document.getElementById('interactive-btn');
  btn.hidden = state.mode === 'desktop';
  btn.textContent = state.interactive ? 'Mouse: overlay' : 'Mouse: jogo';
  btn.classList.toggle('on', state.interactive);

  for (const tabBtn of document.querySelectorAll('#tabs button')) {
    tabBtn.classList.toggle('active', tabBtn.dataset.tab === state.tab);
  }

  const toggleKey = state.hotkeys.find((k) => k.action === 'toggle-interactive')?.label ?? '';
  document.getElementById('hint').textContent =
    state.mode === 'desktop'
      ? `Dados: ${state.data?.source ?? '-'} · v${state.data?.bosses?.version ?? '?'}`
      : state.interactive
        ? `${toggleKey}: devolver o mouse ao jogo`
        : `${toggleKey}: interagir com o overlay`;

  document.body.classList.toggle('passive', state.mode !== 'desktop' && !state.interactive);
}

// ---------- aba Bosses ----------

function renderBossTab() {
  const list = bosses();
  const viewId = state.viewBossId ?? state.detectedBossId ?? list[0]?.id;
  const boss = list.find((b) => b.id === viewId);

  const select = h(
    'select',
    { onchange: (e) => { state.viewBossId = e.target.value; render(); } },
    Object.keys(TIER_LABEL).map((tier) =>
      h(
        'optgroup',
        { label: TIER_LABEL[tier] },
        list
          .filter((b) => b.tier === tier)
          .map((b) => h('option', { value: b.id, selected: b.id === viewId }, b.name)),
      ),
    ),
  );

  if (!boss) return h('div', {}, select, h('p', { class: 'muted' }, 'Nenhum boss nos dados.'));

  const classId = activeClassId();
  const groups = logic.groupDrops(boss, classId);
  const dropItem = (drop, mine) =>
    h(
      'li',
      { class: `${mine ? 'mine' : ''} ${drop.mythic ? 'mythic' : ''}` },
      h(
        'details',
        { class: 'drop' },
        h(
          'summary',
          { title: label(drop.power, drop.powerPt) ?? '' },
          itemName(drop.name, drop.namePt),
          drop.slot ? h('span', { class: 'muted' }, ` · ${drop.slot}`) : null,
          drop.classes?.length && !mine ? h('span', { class: 'muted' }, ` (${drop.classes.map(logic.className).join(', ')})`) : null,
          drop.verified === false ? h('span', { class: 'unverified', title: 'Associação ao boss não confirmada' }, ' ?') : null,
        ),
        drop.power || drop.powerPt ? h('div', { class: 'power' }, label(drop.power, drop.powerPt)) : h('div', { class: 'muted' }, 'Sem dados do jogo para este item.'),
      ),
    );

  const sections = [];
  if (classId) {
    sections.push(
      h('h3', {}, `Para ${logic.className(classId)}`),
      groups.mine.length ? h('ul', { class: 'drops' }, groups.mine.map((d) => dropItem(d, true))) : h('p', { class: 'muted' }, 'Nenhum item marcado para sua classe.'),
    );
  }
  if (groups.shared.length) {
    sections.push(h('h3', {}, classId ? 'Outros drops' : 'Drops'), h('ul', { class: 'drops' }, groups.shared.map((d) => dropItem(d))));
  }
  if (groups.others.length) {
    sections.push(
      h('details', {}, h('summary', { class: 'muted' }, `Outras classes (${groups.others.length})`), h('ul', { class: 'drops' }, groups.others.map((d) => dropItem(d)))),
    );
  }
  if (!boss.drops?.length) {
    sections.push(h('p', { class: 'muted' }, 'Tabela de drops ainda não preenchida — edite data/bosses.json ou configure uma URL de dados.'));
  }

  return h(
    'div',
    {},
    select,
    h(
      'div',
      { class: `card ${boss.id === state.detectedBossId ? 'detected' : ''}`, style: 'margin-top:8px' },
      h('h2', {}, boss.name, h('span', { class: `badge ${boss.tier}` }, TIER_LABEL[boss.tier] ?? boss.tier)),
      boss.id === state.detectedBossId ? h('div', { class: 'chip on' }, 'Você está na arena deste boss') : null,
      h('table', {},
        h('tr', {}, h('td', {}, 'Invocação'), h('td', {}, boss.summon ?? '-')),
        boss.unlock ? h('tr', {}, h('td', {}, 'Chave'), h('td', {}, boss.unlock)) : null,
        boss.element ? h('tr', {}, h('td', {}, 'Elemento'), h('td', {}, boss.element)) : null,
        boss.trophy ? h('tr', {}, h('td', {}, 'Troféu'), h('td', {}, `${boss.trophy} (vira único dele no Cubo)`)) : null,
        boss.runes?.length ? h('tr', {}, h('td', {}, 'Runas'), h('td', {}, `${boss.runes.join(', ')} (com Lair of Runes)`)) : null,
        h('tr', {}, h('td', {}, 'Local'), h('td', {}, [boss.arena?.name, boss.arena?.region].filter(Boolean).join(' — ') || '-')),
      ),
      boss.tips?.length ? [h('h3', {}, 'Dicas'), h('ul', {}, boss.tips.map((t) => h('li', {}, t)))] : null,
      sections,
      boss.knownDropCount && boss.drops?.length < boss.knownDropCount
        ? h('p', { class: 'unverified' }, `Lista parcial: ${boss.drops.length} de ~${boss.knownDropCount} únicos.`)
        : null,
    ),
    nameList('Pool geral (todos os bosses)', state.data.bosses.generalPool),
    nameList('Míticos Icônicos (todos os bosses)', state.data.bosses.iconicMythics),
    capstoneList(state.data.bosses.season15Capstone),
    h('details', {}, h('summary', { class: 'muted' }, 'Notas da temporada'), h('ul', {}, (state.data.bosses.notes ?? []).map((n) => h('li', { class: 'muted' }, n)))),
    state.data.bosses.source?.url
      ? h('p', { class: 'muted' }, `Fonte: ${state.data.bosses.source.name} (${state.data.bosses.source.updated ?? '?'})`)
      : null,
  );
}

function nameList(title, names) {
  if (!names?.length) return null;
  return h('details', {}, h('summary', { class: 'muted' }, `${title} (${names.length})`), h('ul', { class: 'drops' }, names.map((n) => h('li', {}, n))));
}

function capstoneList(capstone) {
  if (!capstone) return null;
  const tiers = [['common', 'Comuns (~15%)'], ['uncommon', 'Incomuns (~10%)'], ['rare', 'Raros (~5%)']];
  return h(
    'details',
    {},
    h('summary', { class: 'muted' }, 'Únicos da Temporada 15 (Capstone)'),
    h('p', { class: 'muted' }, capstone.note),
    // flatMap: h() só achata um nível de filhos
    tiers.filter(([k]) => capstone[k]?.length).flatMap(([k, title]) => [h('h3', {}, title), h('ul', { class: 'drops' }, capstone[k].map((n) => h('li', {}, n)))]),
  );
}

// ---------- aba Build ----------

function renderManualCharacter() {
  if (hasGameData()) return null;
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'muted', style: 'margin-bottom:6px' }, 'Sem dados do jogo: informe seu personagem.'),
    h('div', { class: 'row' },
      h('div', {}, h('label', {}, 'Nível'),
        h('input', { type: 'number', min: 1, max: 70, value: state.settings.manualLevel ?? '', onchange: (e) => saveSettings({ manualLevel: Number(e.target.value) || null }) })),
      h('div', {}, h('label', {}, 'Paragon'),
        h('input', { type: 'number', min: 0, value: state.settings.manualParagon ?? '', onchange: (e) => saveSettings({ manualParagon: Number(e.target.value) || null }) })),
    ),
  );
}

function renderBuildPicker(classId) {
  const classSelect = h(
    'select',
    { disabled: hasGameData() && Boolean(state.game.character.classId), onchange: (e) => saveSettings({ manualClassId: e.target.value || null }) },
    h('option', { value: '' }, 'Escolha a classe…'),
    logic.classes.map((c) => h('option', { value: c.id, selected: c.id === classId }, c.name)),
  );

  const options = builds().filter((b) => b.classId === classId);
  return h(
    'div',
    {},
    h('label', {}, 'Classe'),
    classSelect,
    renderManualCharacter(),
    classId ? h('h3', {}, 'Builds disponíveis') : null,
    options.map((b) =>
      h(
        'div',
        {
          class: `card clickable ${b.id === state.settings.selectedBuildId ? 'selected' : ''}`,
          onclick: () => { state.viewPhaseId = null; saveSettings({ selectedBuildId: b.id }); },
        },
        h('strong', {}, b.name), h('span', { class: `badge ${isImported(b) ? 'maxroll' : ''}` }, b.difficulty ?? ''),
        h('div', { class: 'muted' }, b.playstyle ?? ''),
        isImported(b)
          ? h('button', { class: 'btn small', onclick: (e) => { e.stopPropagation(); removeImported(b); } }, 'Remover')
          : null,
      ),
    ),
    classId && !options.length ? h('p', { class: 'muted' }, 'Nenhum build cadastrado para essa classe.') : null,
    renderMaxrollImport(),
    classId ? renderClassSkills(classId) : null,
  );
}

function isImported(build) {
  return build?.source?.kind === 'maxroll';
}

async function removeImported(build) {
  state.settings = await d4.removeImportedBuild(build.id);
  render();
}

/** Importa um build do planner do Maxroll (link ou id). */
function renderMaxrollImport() {
  const status = h('div', { class: 'muted' });
  const input = h('input', { type: 'text', placeholder: 'maxroll.gg/d4/planner/…' });
  const run = async () => {
    status.textContent = 'Importando do Maxroll…';
    const res = await d4.importMaxroll(input.value);
    if (!res.ok) {
      status.textContent = `Erro: ${res.error}`;
      return;
    }
    state.viewPhaseId = null;
    const patch = { selectedBuildId: res.build.id };
    if (!hasGameData() || !state.game.character.classId) patch.manualClassId = res.build.classId;
    await saveSettings(patch);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  return h(
    'div',
    { class: 'card', style: 'margin-top:10px' },
    h('strong', {}, 'Importar build do Maxroll'),
    h('div', { class: 'muted', style: 'margin:4px 0' }, 'Abra um build no planner do Maxroll e cole o link aqui. As fases (Starter, Endgame, Push…) viram o guia.'),
    h('div', { class: 'row' }, input, h('button', { class: 'btn', style: 'flex:0', onclick: run }, 'Importar')),
    h('a', { onclick: () => d4.openExternal(logic.maxrollBuildList) }, 'Ver builds do Maxroll'),
    status,
  );
}

/** Equipamento da fase importada: skills, itens com poder/aspecto, runas e Paragon. */
/** De onde vem o aspecto: masmorra do Códex (com a região) ou drop. */
function aspectOriginText(a) {
  if (!a || a.unknown) return null;
  if (a.dungeon) {
    const zone = label(a.zone, a.zonePt);
    return `Códex: masmorra ${label(a.dungeon, a.dungeonPt)}${zone ? ` (${zone})` : ''}`;
  }
  // antes da T15 alguns dados vinham só com "codex"; sem masmorra = vem de drop
  return 'Obtido por drop (depois fica no Códex)';
}

function renderLoadout(loadout) {
  if (!loadout) return null;
  const aspectBlock = (a) =>
    a.unknown
      ? h('div', { class: 'muted' }, `Aspecto não identificado (id ${a.nid ?? '?'})`)
      : h('div', { class: 'aspect' },
          h('div', {}, itemName(a.name, a.namePt), a.nameUncertain ? h('span', { class: 'unverified', title: 'O Diablo4Companion junta este aspecto com outro de mesmo poder; o nome pode ser o do outro.' }, ' (nome a confirmar)') : null),
          a.power || a.powerPt ? h('div', { class: 'power' }, label(a.power, a.powerPt)) : null,
          h('div', { class: 'muted' }, aspectOriginText(a)),
        );
  const itemRow = (it) => {
    // builds importados antes desta versão só têm `aspect`
    const aspects = it.aspects ?? (it.aspect ? [it.aspect] : []);
    const known = aspects.filter((a) => !a.unknown);
    const title = it.kind === 'unique'
      ? itemName(it.name, it.namePt)
      : known.length
        ? known.map((a) => label(a.name, a.namePt)).join(' + ')
        : it.name ?? (aspects.length ? 'Lendário (aspecto não identificado)' : 'Lendário (sem aspecto)');
    return h(
      'li',
      { class: `${it.kind === 'unique' || it.kind === 'runeword' ? 'unique' : ''} ${it.mythic ? 'mythic' : ''}` },
      h('details', { class: 'drop' },
        h('summary', {}, h('span', { class: 'muted' }, `${it.slot}: `), title,
          it.charm ? h('span', { class: 'muted' }, ' · talismã') : null,
          it.kind === 'runeword' ? h('span', { class: 'muted' }, ` · palavra rúnica${it.mythic ? ' mítica' : ''}`) : null,
        ),
        it.kind === 'unique' && (it.power || it.powerPt) ? h('div', { class: 'power' }, label(it.power, it.powerPt)) : null,
        it.kind === 'unique' && it.boss ? h('div', { class: 'muted' }, `Dropa de ${it.boss.name}`) : null,
        aspects.map(aspectBlock),
        it.runes?.length ? h('div', { class: 'muted' }, `Runas: ${it.runes.join(', ')}`) : null,
      ),
    );
  };
  const step = loadout.paragonStep;
  return h(
    'details',
    { style: 'margin-top:6px' },
    h('summary', { class: 'muted' }, `Equipamento da fase (${loadout.items.length} itens)`),
    loadout.skills.length ? h('div', {}, h('strong', {}, 'Skills: '), loadout.skills.map((s) => s.name).join(', ')) : null,
    h('ul', { class: 'drops loadout' }, loadout.items.map(itemRow)),
    loadout.paragon.length
      ? h('div', {},
          h('strong', {}, 'Paragon'),
          step && step.total > 1 ? h('span', { class: 'muted' }, ` — etapa ${step.name ?? ''} (${step.index + 1}/${step.total})`) : null,
          h('ol', { class: 'paragon' }, loadout.paragon.map((p) => h('li', {},
            label(p.board, p.boardPt),
            p.glyph ? h('span', { class: 'muted' }, ` · glifo ${label(p.glyph, p.glyphPt)}${p.glyphLevel ? ` nv ${p.glyphLevel}` : ''}`) : null,
            p.rotation ? h('span', { class: 'muted' }, ` · rotação ${p.rotation}°`) : null,
          ))),
        )
      : null,
  );
}

function renderGuide(build) {
  const completed = state.settings.completedSteps[build.id] ?? [];
  const current = logic.currentPhase(build, character());
  const phase = build.phases.find((p) => p.id === state.viewPhaseId) ?? current;
  const next = logic.nextStep(phase, completed);
  const pct = logic.progress(build, completed);

  return h(
    'div',
    {},
    h('div', { class: 'row' },
      h('h2', {}, build.name),
      h('button', { class: 'btn', style: 'flex:0', onclick: () => saveSettings({ selectedBuildId: null }) }, 'Trocar'),
    ),
    build.verified === false ? h('div', { class: 'unverified' }, 'Guia modelo — confira detalhes no planner.') : null,
    isImported(build) ? renderImportedActions(build) : null,
    h('div', { class: 'progress' }, h('div', { style: `width:${pct}%` })),
    h('div', { class: 'muted' }, `${pct}% concluído`),
    renderManualCharacter(),
    h('div', { class: 'phases' },
      build.phases.map((p) =>
        h('button', {
          class: `chip ${p.id === current?.id ? 'current' : ''} ${p.id === phase?.id ? 'viewing' : ''} ${p.manual ? 'manual' : ''}`,
          title: p.id === current?.id ? 'Fase atual pelo seu nível' : p.manual ? 'Variante: escolha manual' : '',
          onclick: () => { state.viewPhaseId = p.id; render(); },
        }, p.name),
      ),
    ),
    phase
      ? h('div', { class: 'card' },
          h('strong', {}, phase.name),
          h('div', { class: 'muted', style: 'margin:4px 0' }, phase.focus ?? ''),
          (phase.steps ?? []).map((s) => {
            const done = completed.includes(s.id);
            return h('label', {
              class: `step ${done ? 'done' : ''} ${next?.id === s.id ? 'next' : ''}`,
            },
              h('input', { type: 'checkbox', checked: done, onchange: async () => { state.settings = await d4.toggleStep(build.id, s.id); render(); } }),
              h('span', {}, s.text),
            );
          }),
          renderLoadout(phase.loadout),
        )
      : null,
    h('h3', {}, 'Skills'),
    build.skills.length
      ? h('table', {}, build.skills.map((s) => h('tr', {}, h('td', {}, s.slot), h('td', {}, s.name))))
      : h('p', { class: 'muted' }, 'Defina as skills pelo planner (lista completa da classe abaixo).'),
    build.stats?.length ? [h('h3', {}, 'Prioridade de atributos'), h('ol', {}, build.stats.map((s) => h('li', {}, s)))] : null,
    build.keyItems?.length ? [h('h3', {}, 'Itens / aspectos chave'), h('ul', {}, build.keyItems.map((s) => h('li', {}, s)))] : null,
    build.links?.length
      ? [h('h3', {}, 'Links'), h('ul', {}, build.links.map((l) => h('li', {}, h('a', { onclick: () => d4.openExternal(l.url) }, l.label))))]
      : null,
    renderClassSkills(build.classId),
  );
}

function renderImportedActions(build) {
  const status = h('span', { class: 'muted' });
  return h(
    'div',
    { class: 'row', style: 'margin:4px 0' },
    h('button', {
      class: 'btn small',
      onclick: async () => {
        status.textContent = 'Atualizando…';
        const res = await d4.importMaxroll(build.source.plannerId);
        status.textContent = res.ok ? 'Atualizado.' : `Erro: ${res.error}`;
      },
    }, 'Atualizar do Maxroll'),
    h('button', { class: 'btn small', onclick: () => removeImported(build) }, 'Remover'),
    status,
  );
}

/** Skills da classe extraídas dos arquivos do jogo (data/generated/skills.json). */
function renderClassSkills(classId) {
  const skills = state.data.catalog?.skills?.[classId];
  if (!skills?.length) return null;
  return h(
    'details',
    { style: 'margin-top:10px' },
    h('summary', { class: 'muted' }, `Skills de ${logic.className(classId)} no jogo (${skills.length})`),
    skills.map((sk) =>
      h('details', { class: 'drop' }, h('summary', {}, sk.name), h('div', { class: 'power' }, sk.description || '-')),
    ),
  );
}

function renderBuildTab() {
  const build = selectedBuild();
  const classId = activeClassId();
  if (build && (!classId || build.classId === classId)) return renderGuide(build);
  return renderBuildPicker(classId);
}

// ---------- aba Eventos ----------

function formatCountdown(at) {
  if (!at) return '-';
  const diff = at - Date.now();
  if (diff <= 0) return 'agora / em andamento';
  const total = Math.floor(diff / 1000);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${hh ? `${hh}h ` : ''}${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`;
}

function renderEventsTab() {
  const payload = state.worldEvents;
  if (!payload) return h('p', { class: 'muted' }, 'Carregando eventos…');
  if (!payload.ok) {
    return h('div', {}, h('p', {}, 'Não foi possível consultar o tracker de eventos.'), h('p', { class: 'muted' }, payload.error), h('p', { class: 'muted' }, 'Altere a URL em Config.'));
  }
  const ev = payload.events ?? {};
  return h(
    'div',
    {},
    h('div', { class: 'card' },
      h('h2', {}, 'World Boss'),
      h('div', {}, ev.worldBoss?.name ?? '-'),
      h('div', { class: 'muted' }, [ev.worldBoss?.zone, ev.worldBoss?.territory].filter(Boolean).join(' · ')),
      h('div', { class: 'countdown', 'data-at': ev.worldBoss?.at ?? '' }, formatCountdown(ev.worldBoss?.at)),
    ),
    h('div', { class: 'card' }, h('h2', {}, 'Helltide'), h('div', { class: 'countdown', 'data-at': ev.helltide?.at ?? '' }, formatCountdown(ev.helltide?.at))),
    h('div', { class: 'card' }, h('h2', {}, 'Legion'), h('div', { class: 'countdown', 'data-at': ev.legion?.at ?? '' }, formatCountdown(ev.legion?.at))),
    h('p', { class: 'muted' }, 'Fonte: tracker comunitário (não oficial).'),
  );
}

// ---------- aba Config ----------

function renderConfigTab() {
  const status = h('div', { class: 'muted' });
  const remoteInput = h('input', { type: 'url', value: state.settings.remoteDataUrl ?? '', placeholder: 'https://…/d4overlay-data.json' });
  const eventsInput = h('input', { type: 'url', value: state.settings.worldEventsUrl ?? '' });

  return h(
    'div',
    {},
    h('h3', {}, 'Dados (bosses e builds)'),
    h('div', { class: 'muted' }, `Fonte atual: ${state.data.source} · bosses v${state.data.bosses.version} · builds v${state.data.builds.version}`),
    h('div', { class: 'muted' }, state.data.catalog?.build ? `Catálogo do jogo (d4data): build ${state.data.catalog.build}` : 'Catálogo do jogo ausente — rode npm run d4data'),
    h('div', { class: 'muted' }, state.data.catalog?.companion
      ? `Nomes em português, aspectos e Paragon (Diablo4Companion): ${String(state.data.catalog.companion.commitDate ?? '').slice(0, 10)}`
      : 'Dados do Diablo4Companion ausentes — rode npm run d4companion'),
    h('label', {}, 'URL de dados remota (JSON com { bosses, builds })'),
    remoteInput,
    h('div', { class: 'row', style: 'margin-top:6px' },
      h('button', {
        class: 'btn',
        onclick: async () => {
          await saveSettings({ remoteDataUrl: remoteInput.value.trim() });
          status.textContent = 'Baixando…';
          const res = await d4.refreshData();
          status.textContent = res.ok ? 'Dados atualizados.' : `Erro: ${res.error}`;
        },
      }, 'Salvar e atualizar'),
    ),
    status,
    h('h3', {}, 'Tracker de eventos'),
    eventsInput,
    h('button', { class: 'btn', style: 'margin-top:6px', onclick: () => saveSettings({ worldEventsUrl: eventsInput.value.trim() }) }, 'Salvar'),
    h('h3', {}, 'Comportamento'),
    h('label', { class: 'step' },
      h('input', { type: 'checkbox', checked: state.settings.ptNames, onchange: (e) => saveSettings({ ptNames: e.target.checked }) }),
      h('span', {}, 'Mostrar nomes de itens e aspectos em português'),
    ),
    h('label', { class: 'step' },
      h('input', { type: 'checkbox', checked: state.settings.autoOpenBossPanel, onchange: (e) => saveSettings({ autoOpenBossPanel: e.target.checked }) }),
      h('span', {}, 'Abrir a aba do boss automaticamente ao entrar na arena'),
    ),
    h('h3', {}, 'Atalhos'),
    h('table', {}, state.hotkeys.map((k) => h('tr', {}, h('td', {}, k.label), h('td', {}, k.description)))),
    h('p', { class: 'muted' }, state.overwolf ? 'Rodando com ow-electron: overlay in-game + eventos do jogo.' : 'Rodando com Electron puro: use o jogo em "Tela cheia em janela".'),
    h('h3', {}, 'Créditos'),
    h('ul', { class: 'muted credits' },
      h('li', {}, 'Tabelas de drop e builds: ', h('a', { onclick: () => d4.openExternal('https://maxroll.gg/d4/resources/boss-loot-table-cheat-sheet') }, 'Maxroll'), '.'),
      h('li', {}, 'Nomes em português, aspectos, runas e Paragon: ', h('a', { onclick: () => d4.openExternal('https://github.com/josdemmers/Diablo4Companion') }, 'Diablo4Companion'), ' (MIT, © 2022 Jos Demmers).'),
      h('li', {}, 'Catálogo de únicos e skills: ', h('a', { onclick: () => d4.openExternal('https://github.com/DiabloTools/d4data') }, 'DiabloTools/d4data'), ' (MIT, © 2023 blizzhackers).'),
      h('li', {}, 'Eventos do jogo e overlay: Overwolf. Timers: d4armory.io (não oficial).'),
      h('li', {}, 'Diablo IV © Blizzard Entertainment. Projeto de fã, sem afiliação.'),
    ),
    h('p', { class: 'muted' }, 'Licenças completas no arquivo THIRD_PARTY_NOTICES.md, na pasta onde o app está instalado.'),
  );
}

// ---------- render ----------

function render() {
  if (!state.data) return;
  renderHeader();
  const content = document.getElementById('content');
  const scroll = content.scrollTop;
  const view = { boss: renderBossTab, build: renderBuildTab, events: renderEventsTab, config: renderConfigTab }[state.tab]();
  content.replaceChildren(view);
  content.scrollTop = scroll;
}

function tickCountdowns() {
  for (const el of document.querySelectorAll('.countdown[data-at]')) {
    const at = Number(el.dataset.at);
    if (at) el.textContent = formatCountdown(at);
  }
}

async function init() {
  document.body.classList.add(`mode-${state.mode}`);
  const boot = await d4.bootstrap();
  Object.assign(state, {
    data: boot.data,
    settings: boot.settings,
    game: boot.gameState,
    detectedBossId: boot.bossId,
    interactive: state.mode === 'desktop' ? true : boot.interactive,
    hotkeys: boot.hotkeys,
    overwolf: boot.overwolf,
    worldEvents: boot.worldEvents,
  });

  for (const btn of document.querySelectorAll('#tabs button')) {
    btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render(); });
  }
  document.getElementById('interactive-btn').addEventListener('click', () => d4.setInteractive(!state.interactive));

  d4.onGameState((game) => { state.game = game; render(); });
  d4.onData((data) => { state.data = data; render(); });
  d4.onWorldEvents((payload) => { state.worldEvents = payload; if (state.tab === 'events') render(); });
  d4.onInteractive((value) => { if (state.mode !== 'desktop') { state.interactive = value; render(); } });
  d4.onBossDetected((bossId) => {
    state.detectedBossId = bossId;
    if (bossId) {
      state.viewBossId = null;
      if (state.settings.autoOpenBossPanel) state.tab = 'boss';
    }
    render();
  });
  d4.onHotkey((action) => {
    if (action === 'show-boss') state.tab = 'boss';
    if (action === 'show-build') state.tab = 'build';
    render();
  });

  setInterval(tickCountdowns, 1000);
  render();
}

init();
