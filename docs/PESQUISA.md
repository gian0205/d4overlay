# Pesquisa: APIs e dados disponíveis para Diablo IV

Levantamento feito em setembro/2026 (Temporada 15 — *Lord of Hatred*).

## 1. Blizzard (oficial)

- **Não existe API pública oficial do Diablo IV.** A Battle.net Developer API cobre
  Diablo III, WoW, Hearthstone, StarCraft II e Overwatch, mas não o D4.
  Há pedidos da comunidade no fórum oficial sem resposta ([tópico](https://eu.forums.blizzard.com/en/d4/t/diablo-4-data-api/24505)).
- Consequência: drops de bosses e builds precisam vir de **dados curados** (este repo)
  ou de fontes da comunidade.

## 2. Overwolf

A forma "oficial" (aprovada pela Blizzard/Overwolf) de fazer overlay em jogo.

### ow-electron (usado neste projeto)
- Pacote `@overwolf/ow-electron` = Electron + pacotes nativos do Overwolf.
  Exemplo oficial: [overwolf/ow-electron-packages-sample](https://github.com/overwolf/ow-electron-packages-sample).
- Pacotes declarados no `package.json` → `"overwolf": { "packages": ["gep", "overlay"] }`.
- **Overlay** (`app.overwolf.packages.overlay`):
  - `registerGames({ gamesIds: [22700] })` → Diablo IV é o game id **22700**.
  - eventos `game-launched` (chamar `event.inject()`), `game-injected`, `game-exit`.
  - `createWindow({ name, width, height, passthrough, zOrder, ... })` cria janela *dentro* do jogo
    (funciona em tela cheia exclusiva, ao contrário de uma janela "always on top").
  - `passthrough`: `noPassThrough` | `passThrough` | `passThroughAndNotify` (se o mouse vai para o jogo ou para o overlay).
  - `hotkeys.register({ name, keyCode: 'KeyO', modifiers: { ctrl, shift } }, cb)`.
- **GEP – Game Events Provider** (`app.overwolf.packages.gep`):
  - `game-detected` → `event.enable()` e depois `setRequiredFeatures(22700, [...])`.
  - `new-info-update` (`{ feature, category, key, value }`) e `new-game-event`.
  - Features do Diablo IV ([doc](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/diablo-4/)):
    `gep_internal`, `game_info`, `match_info`, `location`, `me`.
    - `me`: `name`, `class` (ex.: Barbarian/Druid/Necromancer/Rogue/Sorcerer/Spiritborn/Paladin, masculino/feminino), `level`, `paragon_level`, `xp`.
    - `location`: `area`, `territory` e coordenadas x/y/z.
  - **Não há evento de "boss iniciado" nem de loot**: por isso a detecção do boss é feita pela
    `location.area` (nome da arena) — ver `arena.matchers` em `data/bosses.json`.
- Para distribuir o app com overlay/GEP é preciso **registrar o app no Overwolf**
  (Developers Console) e passar pela revisão deles. Em desenvolvimento os pacotes funcionam localmente.

### Overwolf nativo (alternativa)
- Apps HTML/JS rodando dentro do cliente Overwolf (`overwolf.games.events`). Mesmo GEP, mas
  exige o cliente Overwolf instalado. Optamos pelo ow-electron por ser Electron "de verdade".

## 3. Fontes da comunidade

| Fonte | O que tem | API? |
|---|---|---|
| [DiabloTools/d4data](https://github.com/DiabloTools/d4data) | arquivos do jogo extraídos em JSON (skills, itens, aspectos, paragon) | JSON bruto no GitHub — **leitor implementado em `scripts/d4data/`** (ver seção 6) |
| [d4parse](https://github.com/Dakota628/d4parse) | parser dos arquivos do jogo | biblioteca Go |
| Maxroll, D4Guides, Mobalytics, Game8, Icy Veins | builds, tier lists, tabelas de loot | **sem API pública**; não fazer scraping (termos de uso) — usamos só como link |
| d4armory.io / diablo4.life / helltides.com | horários de World Boss, Helltide, Legion | endpoints JSON não oficiais (podem mudar/bloquear) |

## 4. Estado atual do endgame (S15) relevante para os dados

- Classes: Bárbaro, Druida, Necromante, Renegada, Feiticeiro, Espiritonato, Paladino e **Warlock** (nova em Lord of Hatred — confirmada nos arquivos do jogo).
- **Initiate Lair Bosses** (1 Lair Key): Grigoire, The Beast in the Ice, Echo of Varshan, Lord Zir, Urivar.
- **Greater Lair Bosses** (1 Greater Lair Key): Duriel, Andariel, Harbinger of Hatred, The Butcher.
- **Belial**: topo da escada; sem tabela própria — no baú você escolhe a tabela de outro boss.
- Todos os Lair Bosses podem dropar Míticos; cada único específico de boss tem **um** boss dedicado.
- Desde Lord of Hatred, Andariel tem tabela própria (antes compartilhava com Duriel).

## 5. Riscos / limitações

- Overlay por injeção só via Overwolf (whitelistado). Não injetar DLL por conta própria:
  risco de violar os termos da Blizzard.
- A janela "sempre no topo" do modo Electron puro só aparece com o jogo em *Tela cheia em janela*.
- Tabelas de loot mudam a cada temporada → os dados ficam em JSON versionado e podem ser
  atualizados por URL remota sem recompilar o app.

## 6. Leitor do d4data (`scripts/d4data/`)

```bash
npm run d4data          # sync + extract + validate-data
npm run d4data:sync     # baixa só o necessário (~30 MB) em .cache/d4data
npm run d4data:extract  # gera data/generated/uniques.json e skills.json
```

- `sync.js`: clone parcial (`--filter=blob:none`) + *sparse checkout* do repositório
  (que tem ~870 mil arquivos). Só baixa Item/*_Unique_*, StringLists de Item/Affix/Power,
  SkillKit, ItemType e PlayerClass.
- `lib.js` (funções puras, testadas) + `extract.js` (I/O):
  - **Únicos**: `Item/<id>.itm.json` → tipo (`snoItemType`), classes (`fUsableByClass`,
    ordem: Feiticeiro, Druida, Bárbaro, Renegada, Necromante, Espiritonato, Paladino, Warlock),
    Mítico (`eMagicType == 4`); nome/flavor em `StringList/Item_<id>`; poder em
    `StringList/Affix_<id>` ou no primeiro `arForcedAffixes` que tiver texto.
    Descarta placeholders (`[PH]`), transmog (`S10_`), Crucible (`S12_`), talismãs e peixes.
  - **Skills**: `SkillKit/<Classe>.skl.json` → `arActiveSkillEntries` → `StringList/Power_<id>`.
  - Textos: marcação do jogo (`{c_important}`, `{if:SF.IsMythic}…{else}…{/if}`, fórmulas `[...]`)
    é limpa; valores numéricos viram `#` (dependem do item rolado).
- Resultado no build 3.2.1.73552: 310 únicos (13 Míticos) e as skills ativas das 8 classes.

### O que o d4data NÃO tem
- **Tabelas de loot por boss.** O baú do boss (`Actor/EGB_Chest_*_Tormented`) só referencia a
  chave e a condição de abate; o sorteio (TreasureClass) roda no servidor. Por isso a
  associação item→boss continua vindo da comunidade.
- Uso no app: o catálogo **valida** os nomes em `data/bosses.json`/`builds.json`
  (`npm run validate-data`) e **completa** cada drop com classe, tipo e poder na interface.

## 7. Nova verificação dos sites de loot (set/2026)
Maxroll, D4Guides, Game8, Mobalytics, OP.GG, Icy Veins, PC Gamer, urgametips e
d4armory continuam bloqueados no ambiente onde o app foi desenvolvido e nenhum tem API
pública. As listas em `data/bosses.json` foram montadas a partir de trechos de busca e
**cada nome foi conferido contra o catálogo do jogo** (45/45 existem). Os totais por boss
(ex.: Duriel ~23, Grigoire ~19) indicam que as listas ainda estão parciais.
