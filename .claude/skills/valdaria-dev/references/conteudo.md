# Adicionar conteúdo e balancear

## Classe
`CLASSES` em `js/data.js`: `name, faction ('ferro'|'luz'), icon, weapon, role, desc, base {for,int,des,agi,vit}, main, speed, skills` e opcionais
`anyWeapon`, `critMult`. Depois: `LOOK` (aparência procedural, em `scene.js`), `HERO_MODEL` (modelo KayKit e peças padrão, em `scene3d.js`),
`heroAttackClip` se for um tipo de arma novo, e o arquétipo do item inicial (`makeStarterWeapon`).
**Também:** perfil em `CLASS_BUILD` (`js/game.js`) para a montagem automática da Alma e dos artefatos (veja "Equilíbrio por personagem").

## Mecânica própria da classe (classes marcantes)
Cada classe deve ter um jeito próprio de jogar (`CLASSES[x].mech`). Revisão com o dono, uma classe por vez.
- **Lanceiro — Colheita de Almas (`mech: 'souls'`, feito):** o **dano causado** (não abates — por causa do PK) enche a foice: ~5 golpes
  normais (`SOUL_HITS`) = 1 alma, máximo 5 (`R.souls`). No PK conta o dano cheio (antes do redutor), para valer igual a monstro.
  `soul.gain` acelera (Corte da Foice ×1,5); sair do Desvanecer atacando = +1 alma. Golpes com `soul.max` gastam (`soulSpend` em
  `playerHit` e `pvpStep`): Rodopio da Foice até 2 (+25% cada), Salto Ceifador todas (+20% cada, +1 golpe a cada 2), Ceifa Final todas
  (+30% cada, com 5 atordoa). Fora de combate somem (`soulTick`). Auto guarda para os grandes (`soulWait`: ≥3 almas, chefe/elite ou 4+ alvos).
  Visual: bolinhas no painel (`soul-pips`) e almas girando (`updateSouls`, `soulBurst`). Balanceado igual ao Gladiador em 24 h.
  Golpes pedidos pelo dono: **Rodopio da Foice** (gira no lugar, área), **Salto Ceifador** (movimento `spinleap`: salta girando e cai no alvo),
  **Ceifa Final** (foice fantasma gigante `fxGhostScythe` varrendo em volta).
- **As outras 7 (feitas, motor genérico `MECH` em `js/game.js`, `R.res`):** ganhos em `mechOnHit` (dano causado), `mechOnTaken`
  (dano levado/bloqueio), gasto e efeitos em `mechBeforeHit` (chamado em `playerHit` e `pvpStep`; campo `res` do golpe: `max`/`per`
  gastam; `gain` acelera; `stunPer`, `boom`, `pierce`, `exec`, `nova`, `shield`), `mechTick` (some fora de combate), `mechWait` (Auto
  guarda para o golpe grande), `mechHud` (painel) e `mechOrbs` (bolinhas na cena).
  - **Gladiador — Fúria (0–100, `rage`):** dano levado (muito) e causado (pouco) enchem; cada 10 = +2% de ataque (aura de fogo).
    **Execução** (g6) gasta tudo (+1,5%/ponto, +50% em alvo com <30% de vida) com machado fantasma gigante (`fxGhostAxe`). g3 Furacão de Aço, g5 Queda do Titã.
  - **Engenheiro — Células (0–5, `cells`):** dano causado (dele e das torretas) carrega. **Torreta Tesla** (e3, tipo `turret`, `R.turrets`,
    até 2, choques em cadeia, `turretTick`, `buildTurret`/`turretZap`). **Sobrecarga Sísmica** (e6) gasta células (+25%/célula, mais
    atordoar); com 5 as torretas explodem (`turretsBoom`).
  - **Caçadora — Foco (0–5, `focus`):** acertar o mesmo alvo seguidas vezes acumula (`R.focusOn`); trocar zera. **Disparo Perfurante**
    (c6) gasta (+30%/ponto), com 5 atravessa todos (`fxPierce`). **Salto Evasivo** (c4): mortal para trás (movimento `backflip`), recua 3 m e deixa lentos.
  - **Paladino — Fé (0–100, `faith`):** bloquear (+12), levar golpes e acertar mortos-vivos com sagrado enchem. **Martelo da Justiça**
    (p5, até 50, martelo caindo `fxHammer`) e **Julgamento Celestial** (p6, até 100, colunas de luz) gastam (+1,2%/ponto).
  - **Valquíria — Ritmo celeste (`combo`):** a cada 4 ataques sai uma **Investida Celeste** (+80%, asas de luz e salto: `mechFx('dive')`).
    **Tormenta de Lanças** (v6) virou chuva de lanças douradas.
  - **Arcanista — Elementos (`elements`, `R.elems`, `ELEM`, `REACT`):** golpes com `elem` (fogo a1/a5, gelo a3, raio a4); dois diferentes =
    reação: fogo+gelo **Vapor Explosivo** (+50%, lento), gelo+raio **Prisão Elétrica** (+25%, atordoa), fogo+raio **Plasma** (+30%, crítico
    garantido). **Nova Elemental** (a6) gasta os guardados (+30% cada; com os 3, mais).
  - **Clériga — Escudo Sagrado (`shield`):** cura que passa da vida vira escudo até 40% da vida (`healHero`), absorve dano antes da vida
    (`mechAbsorb`, bolha dourada na cena). **Raio Sagrado** (r1) cura 15% do dano (`lifesteal`). **Onda Divina** (r6) transforma o escudo em dano (até +90%).
  - Balanceamento depois disso (24 h): 51–61; Paladino e Clériga um pouco mais lentos (compensam aguentando e no grupo).
  - Efeitos sólidos (que precisam aparecer sobre chão claro) usam `solidMat`, não `fxMat` (que soma luz e some no gramado).

## Habilidade (6 por classe, níveis 1/10/20/35/50/70 em geral)
| tipo | campos |
|---|---|
| `dmg` | `mult`, `hits`, `boss` (bônus em chefe), `holy` (+50% em morto-vivo) |
| `aoe` | `mult`, `targets` (limite), `stun`, `slow`, `healPct`, `holy` |
| `buff` | `stat`, `val`, `dur`, `also: {stat, val}` — stats: atk, def, crit, critdmg, spd, evade, block, absorb, reflect, hpmax, undead, mshield |
| `heal` | `mult` (% da vida) |
| `summon` | `pet` (`golem`, `falcao`, `fera` em `PETS`), `mult`, `dur` |
| `stealth` | `dur` |
| `passive` | `stat`+`val`, ou `revive: segundos` |
Todas (menos passivas) têm `cd` e `mp`. `skillDesc` gera o texto e `skillColor`/`attackSound` dão cor e som pelo nome.
Stat de buff novo → some em `derived()`.

## Monstro e mapa
`ZONES` (`js/data.js`): `{ id, name, min, icon, monsters: [[nome, emoji] ×3], boss: [nome, emoji] }`. Para cada monstro novo: `MON_TYPE` (tipo),
`MON` em `scene.js` (`[corpo, cor, extra]`, corpo: slime, beast, humanoid, skeleton, flyer, golem, bug, serpent, ghost, plant, eye, dragon),
opcionalmente `MON_MODEL` (esqueleto KayKit) em `scene3d.js`. Mapa novo: tema em `THEMES` (`scene.js`) e música em `TRACKS` (`audio.js`).
As missões do mapa são geradas sozinhas (`questDefs`).

## Itens
Tier = `floor(ilvl/17)`. Nomes por tier em `WEAPON_NAMES`/`ARMOR_SLOTS`. Visual de arma nova: crie `wNovaArma(t, k, M, rc)` e registre em `W_BUILD`
(a arma é montada apontando para −y a partir da mão). Raridades em `RARITIES`, atributos extras em `AFFIXES`.

## Conjunto, gema, conquista, diária, login e loja
- **Conjunto:** `SETS` em `game.js` (`name, tier, color, b2, b4, d2, d4`; chaves de bônus: `defp, hpp, crit, critdmg, atkp, spd, block, xpb`).
  Um conjunto por tier; peças nascem em `maybeSet`.
- **Gema:** `GEMS` em `data.js` (`name, icon, color, label, per`) e o efeito em `gemBonus`.
- **Conquista:** item em `ACH` (`id, name, desc, ok(), gold, stones, title`).
- **Diária:** item em `DAILY_TYPES` (`k, t(n), n()`, `minLvl` opcional) e um `dailyProgress('k')` no ponto do jogo onde acontece.
- **Prêmio de login:** `LOGIN_DAYS` (7 posições).
- **Loja:** `SHOP` em `data.js` (`type`: hp, mp, mat, scroll, gembag, mount, pet); o efeito da compra fica em `buyShop`.
- **Masmorra:** custo `dunCost`, recarga `DUN_CD`, andares e força dos monstros em `dungeonFloor`, prêmio em `dungeonReward`.

## Efeito visual de uma habilidade
`SFX[id]` em `scene3d.js`: `anim` (clipe do modelo), `motion` (`spin` com `turns`, `leap` com `h`, `dash` com `n`) e `fx(ctx)`, que agenda os efeitos
e chama `ctx.impact(hit)`/`ctx.hitAll()`. Ajudantes prontos: `fxWhirl, fxShock, fxCracks, fxSpikes, fxBeam, fxBolt, fxCross, fxShards, fxMeteor,
fxVortex, fxNova, fxRain, slash, ring, projectile, burst`. Bônus visível enquanto ativo: `BUFF_VIS[id] = [tipo, cor]`.

## NPC da cidade
`NPCS` (`game.js`: nome, ícone, aba, fala), botão em `#npc-bar` (`index.html`), e em `scene3d.js`: `NPC_LOOK` (posição), `NPC_NAMES`, `NPC_ICON`,
`NPC_MODEL`. Posição também no minimapa da cidade (`drawMinimap`).

## Balanceamento (metas atuais)
- Regra do dono (não exagere): **sozinho dá para chegar ao 100, só que mais devagar e prestando atenção — sem poção morre**; não pode morrer
  toda hora. **Em equipe é difícil morrer**, principalmente com funções diferentes (dano, tanque, mago, cura); só morre quem puxa monstro demais.
  Cada ponto depois do 80 tem que fazer diferença. Rode `node tools/test/danger.cjs` se mexer em combate ou nos multiplicadores.
- `node tools/test/balance.cjs 24`: **nível ~50–60 em 24 h** (com a história; mostra o capítulo alcançado) de jogo contínuo no Auto (com pontos de habilidade automáticos), poucas mortes (< 30), nenhuma classe muito à frente.
- Se uma classe travar sem morrer, procure laços: chefe que cura, alvo inalcançável ou missão impossível ocupando espaço.
- XP por nível: `xpNeed(l) = 40·l^2,6 (+8%/nível acima de 79) + 60`. Monstros do mundo: vida ×0,55, ataque ×0,5, XP ×0,78 (×0,6 do grupo ×1,3 do mundo).
- Missões: caçada = 12% do XP do nível; chefe = 35%.
- Ouro sobra no fim do jogo (só o refino gasta): ponto conhecido para melhorar.

## Equilíbrio por personagem (Alma e artefatos)
Regra do dono: **cada personagem reforça o que falta**. Quem já bate muito busca defesa; quem já aguenta (ou tem vitalidade) busca ataque.
- `CLASS_BUILD[classe].w` dá o peso de cada pedra (`atk`, `crit`, `vit`, `def`, `res`) e `why` explica em uma frase para o jogador.
  | Classe | Prioridade | Por quê |
  |---|---|---|
  | Gladiador | defesa, vida, resistência | bate muito e luta colado |
  | Lanceiro | defesa, resistência, vida | dano em área, fica cercado |
  | Caçadora | vida, defesa, crítico | já tem crítico, pouca vida |
  | Valquíria | vida, ataque, defesa (equilibrada) | híbrida |
  | Engenheiro | ataque, crítico | resistente e tem o autômato |
  | Paladino | ataque, crítico | aguenta muito, mata devagar |
  | Arcanista | ataque, crítico, resistência | maga com escudo de mana e vitalidade |
  | Clériga | ataque, vida, resistência | cura bem, pouco dano |
- `buildWeights()` ajusta pelos pontos do herói: parte em vitalidade acima de 40% puxa para ataque; abaixo puxa para defesa (×0,6 a ×1,6).
- `autoSoul()` monta linhas inteiras do mesmo tipo para as prioridades (centro primeiro), usa Harmonia quando não dá linha igual e respeita
  os espaços abertos. `autoArts()` põe no centro a peça ligada à prioridade (`T2SLOT`: ataque = luvas, crítico = arma, defesa = armadura,
  vida = elmo, resistência = anel) e nos lados os que mais ampliam. Com `S.settings.autoAlma` remonta ao cair pedra ou artefato.
- **A sugestão é opcional (pedido do dono):** o jogador monta como quiser — qualquer pedra em qualquer espaço, qualquer artefato em qualquer
  posição, e todas as combinações valem para todas as classes. `autoAlma` vem **desligado**; montar à mão (`manualAlma`) desliga sozinho.
  Nunca prenda um bônus a uma classe nem desfaça a montagem do jogador sem ele pedir.
- Ao mexer em números de classe, confira se a prioridade continua fazendo sentido e rode `balance.cjs`.

## Mapas escondidos (desvios)
| Id | Mapa | Nível | Sai de | Monstros | Chefe |
|---|---|---|---|---|---|
| b1 | Costa dos Naufrágios 🏖️ | 9–15 | Bosque Sussurrante | Caranguejo Gigante, Pirata Afogado, Gaivota Feroz | Capitão Abissal |
| b2 | Bosque dos Cogumelos 🍄 | 22–29 | Minas de Ferro Negro | Cogumelo Saltador, Fada Sombria, Lagarta Gigante | Rainha Micélio |
| b3 | Selva Esmeralda 🌴 | 30–38 | Deserto de Cobre | Pantera Negra, Planta Carnívora, Xamã Tribal | Serpente Ancestral |
| b4 | Picos Trovejantes ⛈️ | 60–69 | Cidadela Infernal | Harpia, Golem Rúnico, Guerreiro da Tempestade | Senhor do Trovão (quase sempre chove) |
Para um monstro novo: nome em `MON_TYPE` (data.js), aparência em `MON` (scene.js) e, se for humanoide, modelo em `MON_MODEL` (scene3d.js).

## Capítulo de história
Em `STORY` (`js/game.js`): `{ lvl, title, zone, obj: {k, n}, intro: [[quem, fala]...], outro: [...] }`. `quem` vem de `SPEAK`. Objetivos que o Auto
consegue fazer: `kill`, `boss` (desafia sozinho com 25 abates), `visit` (só desvio do mapa atual), `dungeon` (do mapa atual), `sboss`.
Mantenha a ordem por nível e o mapa compatível com o nível, senão o Auto trava. Conteúdo sempre próprio (nada de nomes de outros jogos).
