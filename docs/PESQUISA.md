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
    - `me`: `name`, `class` (**ID numérico**, ver seção 9), `level`, `paragon_level`, `xp`, `health`.
    - `location`: key `map` = `{"area": id, "territory": id}` (**IDs numéricos**) e key `location` = x/y/z.
  - **Não há evento de "boss iniciado" nem de loot**: por isso a detecção do boss é feita pela
    área (ID traduzido para nome) — ver `arena.areaIds`/`arena.matchers` em `data/bosses.json`.
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
| Maxroll (planner) | builds completos por fase | JSON público `planners.maxroll.gg/profiles/d4/<id>` — **importador em `src/shared/maxroll.js`** (seção 10) |
| [josdemmers/Diablo4Companion](https://github.com/josdemmers/Diablo4Companion) | únicos/aspectos/runas/Paragon em 14 idiomas (inclui ptBR), importadores de build | JSON no GitHub, MIT — **usado em `scripts/d4companion/`** |
| D4Guides, Mobalytics, Game8, Icy Veins, D4Builds | builds, tier lists, tabelas de loot | sem API; Mobalytics/D4Builds só com navegador automatizado (Selenium) — usamos só como link |
| d4armory.io / diablo4.life / helltides.com | horários de World Boss, Helltide, Legion | endpoints JSON não oficiais (podem mudar/bloquear) |

## 4. Estado atual do endgame (S15) relevante para os dados

- Classes: Bárbaro, Druida, Necromante, Renegada, Feiticeiro, Espiritonato, Paladino e **Warlock** (nova em Lord of Hatred — confirmada nos arquivos do jogo).
- **Initiate Lair Bosses** (1 Lair Key): Grigoire, The Beast in the Ice, Echo of Varshan, Lord Zir, Urivar.
- **Greater Lair Bosses** (1 Greater Lair Key): Duriel, Andariel, Harbinger of Hatred, The Butcher.
- **Especiais**: Astaroth (fim das Escalating Nightmare Dungeons, 1 Escalation Sigil) e Bartuc (Infernal Hordes, 1 Infernal Hordes Compass) também têm tabela dedicada.
- **Belial** (1 Superior Lair Key): topo da escada; sem tabela própria — copia a tabela do boss que você escolher.
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

## 8. Tabelas completas pelo Maxroll (22/09/2026)
Rodando localmente no Windows, o [Boss Loot Table Cheat Sheet do Maxroll](https://maxroll.gg/d4/resources/boss-loot-table-cheat-sheet)
abriu normalmente. De lá vieram as tabelas completas dos 11 bosses com tabela dedicada
(267 únicos, organizados por classe), além de troféus, runas (com o nó *Lair of Runes*),
pool geral, Míticos Icônicos e os únicos novos da S15 (masmorras Capstone de Baal, Mefisto e
Diablo). **Todos os nomes existem no catálogo do jogo e a classe de cada item bate com o
`fUsableByClass` do d4data**, então os drops deixaram de ser marcados com "?".

## 9. Formato real do GEP (doc do Overwolf, set/2026)
A [página de eventos do Diablo 4](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/diablo-4/)
mostra que **o GEP não manda nomes, manda IDs numéricos**:

- `me` → `class`: número (ex.: `220940` = "Sorcerer Male"). A doc lista 14 IDs (7 classes × 2
  sexos); **o Warlock ainda não aparece**. Tabela em `src/shared/gep-ids.js`.
- `location` → key `map`: `{"area": 448837, "territory": 445427}`. A key `location` traz só
  coordenadas x/y/z.
- `getInfo` agrupa por categoria (`character`, `match_info`), não por feature.
- Também existem `match_info.in_pit`/`pit_tier`, eventos `match_start`/`match_end`/`death`, e
  `game_info.gold`/`battlenet_tag`.

As tabelas oficiais de IDs estão em `data/gep/area_names.txt` (2.612 áreas) e
`data/gep/territory_names.txt`. O app traduz o ID para nome e compara com `arena.matchers`;
quando o ID é conhecido, `arena.areaIds` tem prioridade.

Arenas encontradas na tabela (viraram `areaIds`): Hall of the Penitent `1496133` (Grigoire),
Malignant Burrow `1767907` (Varshan), The Darkened Way `445562` (Zir), Astaroth's Lair
`2278706/2278711/2330051/2330476`, Belial's Chamber `2189180`.

**Não encontradas**: Glacial Fissure, Gaping Crevasse, Hanged Man's Hall, Urivar, Harbinger,
Butcher, Bartuc. Candidatos a confirmar no jogo: "Path of the Maggot" `1496163` (Duriel? ID
vizinho ao do Hall of the Penitent), "The Hanged Man" `1209523` (Andariel?), e as áreas genéricas
"Nemesis Lair" `2518058/2518084`, "Greater Nemesis Lair" `2520126/2520149`, "Ultimate Nemesis
Lair" `2608935/2608992`. Se os Lair Bosses de Lord of Hatred usam essas áreas genéricas, a área
sozinha não diz qual boss é. Ao rodar com o jogo, o console mostra `[gep] área: <id> = <nome>` a
cada troca de área.

## 10. Diablo4Companion e o planner do Maxroll (set/2026)
O [Diablo4Companion](https://github.com/josdemmers/Diablo4Companion) (C#/WPF, MIT, ativo)
mostrou dois recursos que o app passou a usar:

- **Planner do Maxroll em JSON**: `GET https://planners.maxroll.gg/profiles/d4/<id>` é público
  (sem login). Traz `name`, `class`, `season`, `date`, `user` e `data` (JSON em string) com
  `profiles[]` — cada perfil tem `name` (Starter/Midgame/Endgame/Push…), `level`, `skillBar`
  (ids como `Paladin_BlessedShield`), `items` (slot → índice em `data.items`) e `paragon.steps`
  (tabuleiros `Paragon_<Classe>_NN` + glifo). Os ids de skills e únicos são **os mesmos dos
  arquivos do jogo** (d4data); o `nid` dos aspectos é o `IdSno` dos dados do Diablo4Companion.
  Slots 20–26 são o talismã de Lord of Hatred (`Talisman_Seal_*`, `Talisman_Charm_Set_<cls>_NN_P`
  e `Talisman_Charm_Unique_<único>`). A lista de builds oficiais (`/d4/planner/maxroll-builds`)
  usa um índice de busca interno com chave própria — por isso o app só abre essa página e
  importa pelo link.
- **Dados em 14 idiomas**: `D4Companion/Data/{Uniques,Aspects,Runes,ParagonBoards,ParagonGlyphs}.<lang>.json`.
  Em ptBR cobrem os 310 únicos do catálogo, os 523 aspectos, as 52 runas e os 80 tabuleiros.
  Detalhe: `IdName` às vezes junta variantes (`"A;S14_A"`), então a junção enUS↔ptBR é feita
  por qualquer id de `IdNameList`.
- Importadores de Mobalytics e D4Builds usam Selenium (navegador automatizado) — não adotado.

**Nível máximo**: Lord of Hatred subiu o nível máximo de 60 para 70
([Icy Veins](https://www.icy-veins.com/d4/news/diablo-4-level-70-cap-changes-build-progression/));
o planner do Maxroll marca os perfis com nível 70. O app usa `MAX_LEVEL = 70`.
