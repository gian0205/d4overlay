# D4 Overlay

Overlay para **Diablo IV** feito em Electron que:

- mostra os **drops do boss** quando você entra na arena dele (ou manualmente pela aba *Bosses*),
  destacando os itens da sua classe;
- mostra os **builds da classe**; você escolhe um e o app te **orienta passo a passo**
  (fase atual pelo seu nível/Paragon, checklist, skills, atributos, itens chave);
- **importa builds do planner do Maxroll**: cole o link e cada perfil do planner (Starter,
  Endgame, Push…) vira uma fase com skills, itens, aspectos, runas e Paragon — e diz de qual
  boss dropa cada único;
- mostra nomes de itens e aspectos **em português** (com o nome original ao lado);
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
npm run d4companion    # baixa nomes ptBR/aspectos/runas/Paragon do Diablo4Companion
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
scripts/d4companion/  conversor dos dados do Diablo4Companion (ptBR, aspectos, runas, Paragon)
data/            bosses.json e builds.json (curados)
data/generated/  uniques.json, skills.json (d4data) e d4companion.json (gerados)
data/gep/        tabelas oficiais de IDs de área/território do GEP (Overwolf)
docs/            pesquisa de APIs
```

## Catálogo do jogo (d4data)

`npm run d4data` baixa só a parte necessária do [DiabloTools/d4data](https://github.com/DiabloTools/d4data)
e gera `data/generated/uniques.json` (310 únicos com classe, tipo, poder e se é Mítico) e
`data/generated/skills.json` (skills das 8 classes, incluindo Paladino e Warlock).
O app usa isso para completar os drops (classe, tipo, poder) e `npm run validate-data`
avisa quando um nome de item ou skill não existe no jogo. As **tabelas de loot por boss não
existem** nos arquivos do cliente (são do servidor) — detalhes em `docs/PESQUISA.md`.

## Builds do Maxroll

Na aba *Build*, cole o link de um build do planner (`maxroll.gg/d4/planner/<id>`) em
**Importar build do Maxroll**. O app lê o JSON público `planners.maxroll.gg/profiles/d4/<id>`
(o mesmo usado pelo [Diablo4Companion](https://github.com/josdemmers/Diablo4Companion)) e:

- transforma cada perfil do planner em uma fase do guia. Leveling vale até o nível 69;
  Starter/Midgame/Endgame viram Paragon 0/100/200; variantes (Push, Speedfarm, Pit, Uber…)
  ficam para escolha manual (botão tracejado);
- monta o checklist: barra de skills, cada único (com o boss que dropa), **todos** os aspectos
  de cada peça (inclusive os 2 do amuleto lendário e o do amuleto único), com a masmorra e a
  região que liberam o aspecto no Códex ou "obtido por drop", selo mítico e peças de conjunto do
  talismã, runas e a etapa de Paragon da fase (tabuleiros, glifo com nível e rotação);
- guarda o build em `%APPDATA%/d4overlay/imported-builds.json` (botões *Atualizar do Maxroll*
  e *Remover* no guia).

## Nomes em português

`npm run d4companion` baixa do Diablo4Companion (licença MIT) os arquivos enUS/ptBR de únicos,
aspectos, runas, sigilos (masmorras) e Paragon e gera `data/generated/d4companion.json`. Com isso
os drops e o equipamento dos builds aparecem em português, com o nome em inglês ao lado (útil
para trade e guias). Dá para desligar em *Config*.

Rode `npm run d4data` antes: o nome pt-BR de um único só é usado quando o nome em inglês confere
com `data/generated/uniques.json`, porque o Diablo4Companion junta numa entrada só itens com o
mesmo poder (ex.: Flameweaver e Bucrani's Grip). Nesses casos o nome fica em inglês e só o poder
aparece em português. Os créditos e licenças estão em [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Dados (importante)

As tabelas de drop em `data/bosses.json` vêm do Boss Loot Table Cheat Sheet do Maxroll
(Temporada 15, atualizado em 22/09/2026) e cada nome foi conferido no catálogo do jogo. Os
builds são **modelos de guia** que apontam para o planner completo. Revise antes de usar.

- **Bosses** (`data/bosses.json`): o GEP manda a área como **ID numérico**; o app traduz com
  `data/gep/area_names.txt` e compara com `arena.areaIds` (ID exato) ou `arena.matchers`
  (trecho do nome). Drops aceitam `classes: [...]`.
- **Builds** (`data/builds.json`): `phases` com `minLevel`/`maxLevel` (leveling; nível máximo 70
  desde Lord of Hatred) ou `minParagon` (endgame), cada uma com `steps` (checklist);
  `manual: true` tira a fase da escolha automática.
- **Atualização sem recompilar**: publique um JSON `{ "bosses": {...}, "builds": {...} }`
  (por ex. no GitHub raw) e informe a URL em *Config → URL de dados remota*.
