# D4 Overlay

Overlay para **Diablo IV** feito em Electron que:

- mostra os **drops do boss** quando você entra na arena dele (ou manualmente pela aba *Bosses*),
  destacando os itens da sua classe;
- mostra os **builds da classe**; você escolhe um e o app te **orienta passo a passo**
  (fase atual pelo seu nível/Paragon, checklist, skills, atributos, itens chave);
- mostra timers de **World Boss / Helltide / Legion** (tracker comunitário).

> A pesquisa sobre APIs (Blizzard, Overwolf GEP/overlay, fontes da comunidade) está em
> [`docs/PESQUISA.md`](docs/PESQUISA.md). Resumo: **não há API oficial do D4**; o Overwolf
> fornece overlay in-game e eventos (classe, nível, Paragon, área), então os dados de drops e
> builds ficam em JSON curado neste repositório.

## Como funciona

| Modo | Comando | Overlay | Dados do jogo |
|---|---|---|---|
| **ow-electron** (recomendado) | `npm start` | janela injetada no jogo (funciona em tela cheia) | classe, nível, Paragon e área via GEP |
| Electron puro | `npm run start:electron` | janela transparente sempre no topo (use *Tela cheia em janela*) | informados manualmente |

O app detecta sozinho em qual runtime está (`app.overwolf`).

### Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+Shift+O` | alternar mouse entre overlay e jogo |
| `Ctrl+Shift+B` | aba de bosses |
| `Ctrl+Shift+G` | aba do guia de build |
| `Ctrl+Shift+H` | mostrar/ocultar overlay |

## Desenvolvimento

```bash
npm install
npm test               # testes da lógica (node:test)
npm run validate-data  # valida data/*.json
npm start              # roda com ow-electron (Windows, com Diablo IV)
npm run start:electron # roda com Electron puro (qualquer SO)
npm run dist           # instalador Windows via ow-electron-builder
npm run d4data         # lê os arquivos do jogo (DiabloTools/d4data) e gera data/generated/
```

Para publicar com overlay/GEP é necessário registrar o app no Overwolf (Developers Console).

### Estrutura

```
src/main/        processo principal
  main.js              hub: estado do jogo, IPC, escolhe o backend
  backend-overwolf.js  overlay in-game + GEP (Diablo IV = game id 22700)
  backend-fallback.js  janela always-on-top + globalShortcut
  data-store.js        dados empacotados / cache / URL remota
  world-events.js      timers de World Boss, Helltide, Legion
  preload.js           ponte segura (contextBridge) para a UI
src/shared/      lógica pura e testada (detecção de boss, fases do guia, estado do GEP)
src/renderer/    interface (HTML/CSS/JS sem framework)
scripts/d4data/  leitor dos arquivos do jogo (DiabloTools/d4data)
data/            bosses.json e builds.json (curados)
data/generated/  uniques.json e skills.json (gerados pelo leitor)
docs/            pesquisa de APIs
```

## Catálogo do jogo (d4data)

`npm run d4data` baixa só a parte necessária do [DiabloTools/d4data](https://github.com/DiabloTools/d4data)
e gera `data/generated/uniques.json` (310 únicos com classe, tipo, poder e se é Mítico) e
`data/generated/skills.json` (skills das 8 classes, incluindo Paladino e Warlock).
O app usa isso para completar os drops (classe, tipo, poder) e `npm run validate-data`
avisa quando um nome de item ou skill não existe no jogo. As **tabelas de loot por boss não
existem** nos arquivos do cliente (são do servidor) — detalhes em `docs/PESQUISA.md`.

## Dados (importante)

Os arquivos em `data/` são um **rascunho da Temporada 15**. As listas de drops são parciais
e marcadas com `"verified": false` (a associação item→boss veio de buscas; o nome do item foi
conferido no catálogo do jogo). Urivar, Harbinger, Butcher e Belial ainda estão sem itens. Os
builds são **modelos de guia** que apontam para o planner completo. Revise antes de usar.

- **Bosses** (`data/bosses.json`): `arena.matchers` são trechos do nome da área que o GEP
  reporta — é assim que o app sabe que você entrou na arena. Drops aceitam `classes: [...]`.
- **Builds** (`data/builds.json`): `phases` com `minLevel`/`maxLevel` (leveling) ou
  `minParagon` (endgame), cada uma com `steps` (checklist).
- **Atualização sem recompilar**: publique um JSON `{ "bosses": {...}, "builds": {...} }`
  (por ex. no GitHub raw) e informe a URL em *Config → URL de dados remota*.
