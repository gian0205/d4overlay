# Avisos de terceiros

O D4 Overlay usa dados derivados dos projetos abaixo. As licenças deles exigem
que o aviso de copyright acompanhe as cópias.

## Diablo4Companion

- Projeto: https://github.com/josdemmers/Diablo4Companion
- Uso: `scripts/d4companion/` baixa `D4Companion/Data/*.json` (únicos, aspectos,
  runas, sigilos e Paragon em inglês e português) e gera
  `data/generated/d4companion.json`.

```
MIT License

Copyright (c) 2022 Jos Demmers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## DiabloTools/d4data

- Projeto: https://github.com/DiabloTools/d4data
- Uso: `scripts/d4data/` lê os arquivos do jogo extraídos e gera
  `data/generated/uniques.json` e `data/generated/skills.json`.

```
MIT License

Copyright (c) 2023 blizzhackers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Outras fontes (sem código ou dados redistribuídos sob licença)

- **Maxroll** (https://maxroll.gg): as tabelas de drop de `data/bosses.json` foram
  montadas a partir do *Boss Loot Table Cheat Sheet*, e o importador lê o JSON
  público do planner (`planners.maxroll.gg/profiles/d4/<id>`) quando o usuário cola
  um link. Crédito aos autores dos guias e builds.
- **Overwolf** (https://dev.overwolf.com): tabelas de IDs de área/território do GEP
  em `data/gep/`, baixadas da documentação de desenvolvedor.
- **d4armory.io**: timers de eventos (tracker comunitário, não oficial).

Diablo IV, seus nomes e textos são © Blizzard Entertainment, Inc. Este é um projeto
de fã, sem afiliação com a Blizzard, o Maxroll ou o Overwolf.
