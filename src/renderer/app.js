'use strict';

/* global d4 */

const logic = d4.logic;
const TIER_LABEL = { initiate: 'Initiate', greater: 'Greater', pinnacle: 'Pináculo' };

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
    ['initiate', 'greater', 'pinnacle'].map((tier) =>
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
      { class: mine ? 'mine' : '' },
      drop.name,
      drop.classes?.length && !mine ? h('span', { class: 'muted' }, ` (${drop.classes.map(logic.className).join(', ')})`) : null,
      drop.verified === false ? h('span', { class: 'unverified', title: 'Não verificado' }, ' ?') : null,
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
        h('tr', {}, h('td', {}, 'Local'), h('td', {}, [boss.arena?.name, boss.arena?.region].filter(Boolean).join(' — ') || '-')),
      ),
      boss.tips?.length ? [h('h3', {}, 'Dicas'), h('ul', {}, boss.tips.map((t) => h('li', {}, t)))] : null,
      sections,
    ),
    h('details', {}, h('summary', { class: 'muted' }, 'Notas da temporada'), h('ul', {}, (state.data.bosses.notes ?? []).map((n) => h('li', { class: 'muted' }, n)))),
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
        h('input', { type: 'number', min: 1, max: 60, value: state.settings.manualLevel ?? '', onchange: (e) => saveSettings({ manualLevel: Number(e.target.value) || null }) })),
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
        h('strong', {}, b.name), h('span', { class: 'badge' }, b.difficulty ?? ''),
        h('div', { class: 'muted' }, b.playstyle ?? ''),
      ),
    ),
    classId && !options.length ? h('p', { class: 'muted' }, 'Nenhum build cadastrado para essa classe.') : null,
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
    h('div', { class: 'progress' }, h('div', { style: `width:${pct}%` })),
    h('div', { class: 'muted' }, `${pct}% concluído`),
    renderManualCharacter(),
    h('div', { class: 'phases' },
      build.phases.map((p) =>
        h('button', {
          class: `chip ${p.id === current?.id ? 'current' : ''} ${p.id === phase?.id ? 'viewing' : ''}`,
          title: p.id === current?.id ? 'Fase atual pelo seu nível' : '',
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
        )
      : null,
    h('h3', {}, 'Skills'),
    h('table', {}, build.skills.map((s) => h('tr', {}, h('td', {}, s.slot), h('td', {}, s.name)))),
    build.stats?.length ? [h('h3', {}, 'Prioridade de atributos'), h('ol', {}, build.stats.map((s) => h('li', {}, s)))] : null,
    build.keyItems?.length ? [h('h3', {}, 'Itens / aspectos chave'), h('ul', {}, build.keyItems.map((s) => h('li', {}, s)))] : null,
    build.links?.length
      ? [h('h3', {}, 'Links'), h('ul', {}, build.links.map((l) => h('li', {}, h('a', { onclick: () => d4.openExternal(l.url) }, l.label))))]
      : null,
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
      h('input', { type: 'checkbox', checked: state.settings.autoOpenBossPanel, onchange: (e) => saveSettings({ autoOpenBossPanel: e.target.checked }) }),
      h('span', {}, 'Abrir a aba do boss automaticamente ao entrar na arena'),
    ),
    h('h3', {}, 'Atalhos'),
    h('table', {}, state.hotkeys.map((k) => h('tr', {}, h('td', {}, k.label), h('td', {}, k.description)))),
    h('p', { class: 'muted' }, state.overwolf ? 'Rodando com ow-electron: overlay in-game + eventos do jogo.' : 'Rodando com Electron puro: use o jogo em "Tela cheia em janela".'),
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
