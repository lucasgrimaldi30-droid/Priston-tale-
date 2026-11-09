# Arquitetura

## Arquivos
| Arquivo | Conteúdo |
|---|---|
| `index.html` | Telas (seleção, criação, jogo). O jogo é um `#stage` em tela cheia com o canvas e o HUD por cima |
| `css/style.css` | Visual. No final ficam os blocos da Fase 3 (HUD de MMO) e o layout de celular (`max-width: 760px`) |
| `js/data.js` | Dados: `FACTIONS`, `CLASSES`, `MON_TYPES`/`MON_TYPE`, `PETS`, `CITIES`, `ZONES`, `RARITIES`, nomes de armas e armaduras, `AFFIXES`, `SHOP` |
| `js/game.js` | Regras, estado, combate, mundo aberto, missões, interface, save e eventos |
| `js/scene3d.js` | Cena 3D (Three.js r128) + fachada `Scene` no final, que escolhe 3D ou 2D |
| `js/scene.js` | Cena 2D de reserva (`Scene2D`). Também exporta `LOOK`, `MON`, `THEMES` e `RANGED`, usados pela 3D e pelo minimapa |
| `js/audio.js` | Áudio procedural: `Sfx.play(nome)`, `Sfx.music(trilha)`, sem arquivos |
| `js/vendor/` | three.min.js r128, GLTFLoader, SkeletonUtils (sem CDN) |
| `assets/models/` | KayKit (CC0) otimizados: personagens sem animação + `anims.glb` (32 clipes compartilhados) + `skel_props.glb` |
| `js/net.js` | Cliente do servidor (`Net`): contas, saves na nuvem, presença por WebSocket, chat e ranking. Fica offline se a página não tiver `window.VALDARIA_SERVER` |
| `server/` | Servidor Node.js (`server.js` + `ws`): entrega o jogo, API REST, tempo real e banco em `DATA_DIR/db.json` |
| `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `DEPLOY.md` | Subir num VPS com HTTPS automático |
| `tools/` | `models-to-json.mjs` (publicação) e `test/` (features, smoke, balance, multiplayer, servidor estático) |

## Estado
- `S` = personagem salvo (localStorage `valdaria_slot_N`):
  - básico: `name, cls, lvl, xp, gold, pts, attr, hp, mp, stones, pots, zone, zoneKills, bosses, stats {kills, deaths, bosses, elites, dungeons, goldEarned}`
  - itens: `equip, inv` (item: `slot, wtype, ilvl, rarity, min, max, def, affixes, refine, req, gems[], set`), `gems {tipo: [n1..n5]}`
  - progressão: `skillLv {id: 1–10}`, `skillOff`, `rebirths`, `quests {active, done}`, `daily {day, list, streak, last, bonusTaken}`, `ach`, `title`, `tut`
  - extras: `owned`, `mount`, `companion`, `xpBoostUntil`, `dunCd`, `settings`
  - `settings`: `autoHp, autoMp, autoSell, autoBoss, autoBuyPots, autoPts, autoSkill, autoQuest, auto, gfx, quality, sfxVol, musVol, muted`
- `R` = execução (não salvo): `mons`, `mon` (alvo), `pos`, `move`, `face`, `moving`, `mounted`, `worldZone`, `dungeon`, `tele` (marcas de chefe),
  `pet` (invocação), `stealth`, `buffs`, `cds`, `dead`, `inTown`, `npc`, `win`, `tab`, `forgeTab`, `log`, `chatTab`, `forceSkill`, `castCount`.
- `derived()` junta atributos + itens ativos (`S.lvl >= req`) + gemas + conjuntos + buffs + passivas + mascote + renascimentos.

## Laço do jogo (`tick`, 10× por segundo)
regeneração → cidade (zona segura) → `initWorld` se trocou de mapa (fora de masmorra) → morte/renascer → `dungeonTick` **ou** repor monstros
(`spawnWorldMonster`, limite `WORLD.cap`) → chefe (`spawnBoss`, Auto só com nível) → poções → `monstersAI` (inclui `bossMechanics`)
→ `resolveTelegraphs` → invocação → `playerAI` (`autoDodge`, ordem de movimento, alvo, ataque/`trySkills`).
Interface em `startLoop`: `renderLive` a cada tick; minimapa a cada 2; tutorial a cada 5; missões a cada 10; conquistas a cada 50.

## Mundo aberto
- `WORLD`: área de ±33 m, entrada ao sul `{0,15}`, arena do chefe ao norte `{0,-23}`, 12 monstros.
- `zoneCamps(zid)`: 5 acampamentos por semente (o mesmo resultado na lógica e na cena).
- `monstersAI`: passear perto do acampamento → aggro a 5 m (chefe 9 m) e chama a matilha do mesmo nome a 4,5 m → persegue → ataca no alcance
  → volta e cura se passar de 17 m de casa. Separação simples para não empilhar.
- `playerAI`: ordem de movimento > alvo > (Auto) monstro mais próximo; anda até `weaponRange()` (corpo a corpo 1,8 m, distância 7 m) e ataca.
- Ordens da cena: `window.gameOrder({type:'move', x, z})` e `({type:'attack', sid})`.

## Combate
`playerHit` → `hitMonster` (crítico, sagrado ×1,5 em morto-vivo, bônus de chefe, atordoar, lentidão) → `killMonster` (XP com penalidade
por monstro muito fraco, ouro, drops, pedras, `questProgress`). Área atinge monstros a até 4,2 m do alvo. `monsterHit`: furtividade → autômato
(atrai golpes) → esquiva → bloqueio → absorção → escudo de mana → reflexo. `die`: ressurreição passiva ou perda de 3% do nível.
`trySkills`: habilidade pedida (`R.forceSkill`) → `useUtility` (cura < 60%, invocação, furtividade, buffs) → dano (área se houver 2+ por perto).
`castSkill(id)`: uso manual pela barra ou pelas teclas 1–6.

## Interface (Fase 3)
`#player-card`, `.hud-top`, `.hud-right-col` (`#mon-card`, `#minimap` com `drawMinimap`, `#quest-track`), `#chat` (`renderLog`, `LOG_CAT`, `chatCommand`),
`.bottom-bar` (`#skill-bar`, poções `usePotionNow`, `#xp-bar`), `.menu-btns`, janela `#gwin` (`openWin`/`closeWin` + `renderTab`).
NPCs da cidade abrem o `#modal` (`openNpc`/`renderNpc`); `NPCS` define nome, fala e qual aba mostram.
Atalhos no `keydown` do fim de `game.js`.

## Cena 3D (`scene3d.js`)
- `sync(t)`: troca cenário (`buildWorld` ou `buildTown`), reconstrói o herói quando `equipSig()` muda, cria e remove entidades de monstros (`st.ents`, por `sid`)
  e a invocação (`st.pet`).
- Herói: `buildHeroModel` (KayKit + armas procedurais por tier `buildWeaponT`, `buildShieldT`, `buildHelmetModel`, `attachArmor`) ou `buildCharacter`
  (boneco procedural, reserva). Posição/direção vêm de `R.pos`/`R.face` (`heroFollowWorld`). Animações: `playAnim`, `heroAttackClip`.
- Monstros: `buildMonsterModel` (esqueletos KayKit, `MON_MODEL`) ou `buildMonster` (12 tipos de corpo procedurais, `MON`).
- **Efeito próprio por habilidade:** `SFX[idDaHabilidade] = { anim, motion: {type: 'spin'|'leap'|'dash'}, fx(ctx) }`. O jogo envia `skillId` em
  `Scene.playerAttack`; `fx` agenda os efeitos e chama `ctx.impact(hit)`/`ctx.hitAll()` para mostrar os números. Ajudantes: `fxWhirl`, `fxShock`, `fxCracks`,
  `fxSpikes`, `fxBeam`, `fxBolt`, `fxCross`, `fxShards`, `fxMeteor`, `fxVortex`, `fxNova`, `fxRain`. Movimento do herói em `heroFollowWorld` (`h.motion`).
  Bônus visíveis enquanto ativos: `BUFF_VIS[id] = [tipo, cor]` (shield, orbs, speed, flame, holy, shadow, aim, life) em `updateBuffVisuals`.
  Habilidade nova sem entrada em `SFX` usa o efeito genérico.
- Efeitos: `projectile`, `slash`, `ring`, `pillar`, partículas por shader (`spawnP`, `burst`), números (`floatAt`, DOM), `updateWorldUI` (anel do alvo, barras).
- Câmera: `updateCamera` (isométrica no mundo, fixa na cidade), controles em `bindControls` (arrastar, roda, pinça, duplo clique), toque → `pickWorld`/`pickNpc`.
- Tiers visuais: `floor(ilvl/17)` → 0–5; `TIER_COL`, `METAL`, `GRIP`; raridade dá cor e brilho, refino aumenta a intensidade.

## Sistemas de progressão
- **Níveis de habilidade:** `S.skillLv[id]` (1–10), pontos `skillPointsTotal() = floor(nível × 0,6)`, `skillAt(s)` aplica os bônus do nível
  (dano +12%/nv, recarga −3%/nv, duração, efeito; custo de mana +5%/nv). Use sempre `classSkills()` no lugar de `CLASSES[x].skills` em combate.
  `autoSkillPoints()` gasta os pontos quando `S.settings.autoSkill`.
- **Elites:** 7% dos monstros (18% nas masmorras): vida ×2,6, ataque ×1,35, XP e ouro ×4, drops melhores. Aura dourada na cena.
- **Chefes:** `bossMechanics` (golpe esmagador ou ataque em área marcados no chão em `R.tele`, fúria abaixo de 30%, 1 reforço a 50%),
  `resolveTelegraphs`, `autoDodge` (o Auto sai das marcas). Barra grande `#boss-bar`. O chefe não cura ao voltar para a arena.
  O Auto só desafia o chefe com nível suficiente.
- **Masmorras:** `enterDungeon(zid)` (custo `dunCost`, recarga de 5 min), `dungeonFloor` (3 andares; o último tem chefe + elites), `dungeonTick`,
  `dungeonReward`, `exitDungeon`. Cena: `buildDungeon` (arena fechada com muralhas e tochas). Morrer expulsa da masmorra.
- **Economia:** gemas (`GEMS`, `S.gems[tipo][nível]`, `socketGem`, `combineGem`, `gemBonus`, encaixes = índice da raridade), forja (`forgeItem`),
  loja com pergaminho de XP, saco de gemas, montarias (`S.mount`, velocidade ao viajar) e mascotes (`S.companion`, bônus de ouro e XP) em `buyShop`.
  O Ferreiro tem abas (`R.forgeTab`: refinar, gemas, forjar).
- **Conquistas:** `ACH` (22) com recompensas e títulos (`S.ach`, `S.title`), verificadas a cada 50 ticks em `checkAch`. Janela `conquistas` (tecla L).
- **Tutorial:** `TUT` (6 passos), `S.tut` (heróis novos começam em 0 e com o Auto desligado; saves antigos sem `tut` não veem o tutorial).
- **Equipar melhores:** `equipBest()` usa `itemScore()`. **Qualidade gráfica:** `S.settings.quality` (alta/média/baixa) → `Scene.setQuality`.
- **Diárias e login:** `dailyState()` (3 missões por dia escolhidas por semente da data, `dailyProgress(tipo, n)` nos ganchos de abate,
  ouro, habilidades, masmorras e missões; `claimDaily`; bônus ao completar as 3). `checkLogin()` dá o prêmio do dia (ciclo de 7 em `LOGIN_DAYS`)
  e `showLogin` mostra a tela (depois da tela de progresso offline, se houver).
- **Renascimento:** `rebirth()` no nível 100 (`S.rebirths`): volta ao nível 1 e dá +10% ataque/XP/ouro e +5% vida por renascimento.
  Itens com `req` acima do nível ficam **inativos** em `derived()` até o herói alcançá-los.
- **Conjuntos:** `SETS` (um por tier 2–5), `maybeSet` (18% das peças raras+ de armadura/elmo/luvas/botas), `setCounts`, `setBonus` (2 e 4 peças).
  Na cena, as peças usam a cor do conjunto e o herói ganha aura (`setfull` com 4 peças).
- **Especialização (nível 50):** `SPECS[classe]` (2 por classe, chaves de bônus atkp, defp, hpp, crit, critdmg, spd, block, singleMult, aoeMult,
  petMult, healMult, buffDur, undead, mshield), `specOf()`, `chooseSpec(id)` (trocar custa 20.000 × nível em ouro). Cartões na janela de habilidades.
- **Mascotes evoluem:** `S.petXp[id]` conta abates; `petLevel(id)` = 1 + √(abates/60) até 10; cada nível dá +15% ao bônus do mascote.
- **Bestiário:** `S.best[nome]` conta abates; marcos `BEST_TIERS` (50/250/1000) dão +0,25% de dano e XP cada (`bestTiers()`). Janela `bestiario` (tecla B).
- **Medidor:** `R.meter` (`meter()`, `meterHit(dano, fonte)` chamado em `hitMonster`), janela `stats` (tecla D): DPS 30 s, XP/ouro/abates por hora, dano por habilidade.
- **Efeito cresce com o nível:** em `scene3d.js`, `FXS = 1 + (nv−1) × 0,07` aumenta os efeitos grandes; no nível 10 sai um brilho dourado extra.
- **Torre Infinita:** `enterTower('1'|'top')` usa `R.dungeon = { tower: true, floors: Infinity, ... }`; `towerFloor` (monstros nv `3 + andar×2`,
  tema `towerZone(andar)` que troca a cada 5 andares, chefe guardião a cada 5, além do andar 50 vida/ataque +8% por andar), `towerClear`
  (ouro sempre, triplo na primeira vez; guardião novo dá pedras, item e gema), recorde em `S.towerBest`, recomeço de 10 em 10 (`towerStart`).
  Monstros da torre têm `m.tower` (não contam abates/chefes do mapa). Painel `tabTower()` no topo da janela de mapas.
- **Eventos do mundo:** `EVENTS` (xp, gold, elite, boss) pelo relógio real: a cada 30 min um evento de 10 min (`eventNow()`), igual para todos.
  `eventTick()` (1×/s no `tick`) anuncia e cria o **Chefe Mundial** (`spawnWorldBoss`: "Avatar de <chefe>", vida ×5, `m.wboss`, `m.skin` para o modelo
  da cena) uma vez por evento (`S.wbSlot`); `worldBossReward`. O Auto só ataca o Avatar com nível ≥ nível dele − 6. Quadro `eventsBox()`.
- **Dia, noite e chuva:** `worldSky(zid)` em `data.js` (dia de 24 min; chuva em janelas de 6 min, 35%, nunca em caverna/deserto/neve/vulcão/abismo).
  Noite dá +10% XP e chuva +10% ouro (`killMonster`). Na cena: `skyCycle` (luz, cor, neblina, céu noturno, fogueiras maiores) e `rainFx` (gotas e raios).
- **Coleta e artesanato:** `zoneNodes(zid)` (6 pontos por mapa, semente própria: minério, erva, essência), `R.nodes` (recarga 60 s),
  `gatherStep` dentro do `playerAI` (tocar no ponto manda `gameOrder({type:'gather'})`; o Auto coleta pontos a até 14 m sem monstros agressivos;
  `S.settings.autoGather === false` desliga), `gatherDone`, `S.mats`, `S.prof` (coleta e arte, `profLvl`). Receitas `RECIPES` na aba "Criar" do Ferreiro.
  Elites deixam essência (25%). Diária "coletas". Cena: `buildNode`/`updateNodes` (pontos brilham, encolhem quando vazios, herói usa a animação Interact).
- **Mapas ligados:** `zoneExits(zid)` dá as saídas de cada mapa: anterior em `EXIT_PREV` (esquerda da tela), próximo em `EXIT_NEXT` (direita) e
  desvio em `EXIT_BRANCH` (embaixo) — ficam no eixo da tela porque a câmera olha na diagonal. Andar até a saída (`nearExit` no ramo `R.move` do
  `playerAI`) chama `walkZone(ex)`, que troca `S.zone` e põe o herói na saída de volta (`R.arrive`, `inward()`); saída trancada por nível (`exitLocked`).
  `travelStep` faz o Auto andar até o mapa do nível (`S.settings.autoTravel`), lutando antes com o que estiver agressivo por perto.
  Teleporte pela janela de mapas e Portais continua. Cena: arco com portal girando, caminho e placas em `#npc-labels` (`updateExits`; fora da tela a placa
  fica na borda; tocar na placa anda até a saída via `data-goexit`). Minimapa mostra ◀ ▶ ▼.
- **Mapas escondidos (desvios):** `BRANCHES` em `data.js` (b1 Costa dos Naufrágios, b2 Bosque dos Cogumelos, b3 Selva Esmeralda, b4 Picos Trovejantes),
  cada um com `parent` e `span`; `ALL_ZONES = ZONES + BRANCHES`. Use `zoneById`, `zoneSpan`, `zoneTier(z)` (prêmios) e `zoneIdx` (sementes); nunca
  `ZONES.indexOf` para mapas que podem ser desvio. Só aparecem na janela de mapas depois de visitados a pé (`S.visited`). Novos props `palm` e `mushroom`.
- **Monstros variados:** `spawnSource()` — 16% vêm do mapa vizinho e nascem perto da saída dele (`m.border`); 1,5% viram **Errante** (`m.roamer`,
  elite forte que cruza o mapa inteiro, nome "<monstro> Errante", `m.skin` para o modelo) com prêmio raro.
- **Artefatos:** item com refino +10 pode ser consagrado (`consecrate`, botão no item e no refino) e vira artefato em `S.arts` (até 24;
  o item some). Cruz `S.artCross` com os espaços `c` (centro), `n`, `l`, `o`, `s`. Só o centro dá poder, conforme o tipo da peça (`ART_POWER`:
  arma = crítico, armadura = defesa, botas = velocidade, elmo = vida, luvas = ataque, escudo = bloqueio, amuleto = dano crítico,
  anel = resistência). Os 4 de volta ampliam (`artAmp`: 10% + 4% por raridade, ×1,5 de ressonância se for do mesmo tipo ou conjunto).
  `artTotal()` entra no `derived()`. Cruz completa dá a aura `artfull`.
- **Alma:** grade 5×5 em `S.soul.grid` com pedras `{t, l}` (`SOUL`: atk, crit, vit, def, res; níveis 1–5, 3 iguais viram 1 melhor em
  `soulCombine`). Espaços abrem do centro para fora (`SOUL_ORDER`, `soulOpen()`: 9 no começo, +1 a cada 5 níveis depois do 20, 25 no nível 100).
  `soulLines()`: linha ou coluna com 5 iguais = bônus forte; com os 5 tipos diferentes = Harmonia. Grade cheia dá bônus extra e a aura `soulfull`.
  `soulBonus()` entra no `derived()` (`absorb` = resistência). As pedras caem em `dropSoul`: 0,4% dos monstros comuns, 6% dos elites, 60% dos chefes
  (3 do Chefe Mundial), 1 por masmorra e por guardião da torre. Janela `alma` (tecla H, botão 🔮).
- **Missão semanal:** `WEEKLY` (2.000 abates, 12 chefes, 5 masmorras ou torres), `weeklyState()` muda toda segunda (`weekId`), avança junto com
  `dailyProgress`; cada uma dá 3 pedras da Alma e 5 pedras de refino, e as 3 juntas dão mais 3 pedras de nível alto. Aparece na janela de missões.
- **História (nível 1 → 80):** `STORY` (14 capítulos: a Marca do Vazio, os 4 selos e o vilão **Vaelor, o Arauto do Vazio**), falas com
  `SPEAK` (NPCs da cidade), objetivos `kill`, `boss`, `visit`, `dungeon`, `sboss`, `lvl`. `S.story = {ch, prog, seen}`; saves antigos começam no
  capítulo do seu nível. `storyProgress` (ganchos em `killMonster`, `walkZone`, `dungeonReward`), `storyFinish` (prêmio: 15% do XP do nível,
  ouro, pedras e item), conversa em fila (`storyShow`/`storyNext`, `#story-dlg` no alto da tela, não pausa o jogo), `storyTick` no `eventTick`.
  Vaelor (`spawnStoryBoss`, `m.sboss`, modelo do Lich) aparece na arena do Vale dos Titãs no capítulo 13. O Auto segue a história
  (`storyWants`: entra no desvio da história, entra na masmorra, desafia o chefe e volta a um mapa anterior se preciso). Aba no topo das Missões.
- **Depois do 80:** `gainXp` multiplica por `teamXpFactor()` (sozinho `SOLO_80` 60%, dupla 85%, equipe de 3+ no mesmo mapa 110%) —
  sozinho chega ao 100, só que mais devagar. **Laço de Equipe** (`teamBond`): +10% de dano e −10% de dano recebido por colega no mapa (até 3),
  mais o bônus de cada **função** presente (`CLASS_ROLE`/`ROLE_INFO`: dano +10% dano, tanque −15% dano recebido, mago +12% dano,
  cura 1,5% de vida por segundo; as 4 juntas = formação completa, +10%/−10% a mais). `partyMembersNear()` lista os colegas no mapa.
  **Despertar** (`AWK`, `S.awk`): 1 ponto por nível acima de 80 (Fúria, Precisão, Vigor, Bastião, Celeridade, Ruína), painel na janela do herói.
- **Fenda Primordial** (`e1`, desvio do Abismo Eterno, nível 85–100, `danger: true`): monstros com `DANGER` (vida ×3, ataque ×9, XP ×2,4),
  bando que percebe de 8,5 m e chama os outros; chefe vida ×4, ataque ×4. Calibrada com `tools/test/danger.cjs`: médio do 88 sozinho
  sobrevive **com poções** prestando atenção, **sem poções morre**; em equipe com tanque e cura é difícil morrer; muito forte fica tranquilo.
  O Auto sai da Fenda depois de 2 mortes sozinho.
- **Menus aos poucos:** `UNLOCK` (Conquistas nv 3, Ranking 6, Social 10, Alma 20), `applyUnlocks()` no `renderAll`; `openWin` recusa menu trancado.
- **Casa de Títulos:** `TITLES` com bônus (`b`: atkp, defp, hpp, crit, evadep, spd, goldb, xpb, bossDmg, absorb). Permanentes (abates,
  chefes, elites, masmorras, torre, mapas escondidos, Vaelor, ouro, artesanato, Chefes Mundiais, PK) e provisórios: `temp: 'death'` (IMORTAL =
  2 h sem morrer, Invicto = 1.000 abates seguidos; somem em `titlesOnDeath`) ou `temp: segundos` (Fúria Sangrenta, Campeão do Evento).
  `S.titles`, `S.streak` (`alive`, `kills`), `checkTitles()` 1×/s, `titleBonus()` no `derived()` (título equipado = `S.title` pelo nome + coleção:
  +0,5% XP e ouro por permanente). Janela de Conquistas com abas (`R.achTab`: Casa de Títulos e Conquistas). Títulos antigos das conquistas
  continuam cosméticos (sem bônus); não repita nomes entre `ACH` e `TITLES`.
- **Ordem e Rosário (versão enxuta, escolhida pelo dono):** reputação `S.rep {pts, seals}` com a Ordem da cidade (`REP_TIERS`: Neutro,
  Cordial, Amigo, Honrado, Devoto em 4.000). **Selos de Devoção** (`addSeals`): 1 por diária pega, 3 por semanal, 1 por masmorra (nv 20+),
  até 5 pela Arena (a cada 5 rodadas); troca 8 erva + 6 minério + 2 essência = 1 selo; `useSeals` (+60 cada). NPC `ordem` (Irmão Aldric,
  botão 📿 na cidade, sem modelo 3D; também pela janela do herói). Em Devoto e nível 40, `buyRosary` cria um amuleto épico com `it.rosary
  {lvl, elem}` — **fica no lugar do amuleto, sem espaço novo**. `reformRosary` (5 selos + 20 essências) põe o elemento da classe
  (`CLASS_ELEM`); `evolveRosary` sobe 1→9 (`evoCost`). O valor é o **efeito da classe** (`rosaryF()` = nível/9, só se o elemento for da
  sua classe): Fogo Fúria mais rápida, Terra torretas mais longas e fortes, Vento Foco em dobro, Sombra almas mais rápidas, Luz Fé mais
  rápida, Trovão Investida mais forte, Arcano reações mais fortes, Água escudo maior; e +1% de XP por nível.
- **Capa de Guerra:** progresso em `S.cape {lvl 0–13, ref 0–10, vis}` (não é item; não troca). Igual para todas as classes:
  `capeStats()` = ataque 0,6%·nível, defesa e vida 0,8%·nível, ×(1 + 4% por refino), somado no `derived()`. Moedas: 🎗️ `S.insig`
  (Insígnias de Batalha: PK +5, Cerco cristal +1 e a cada 20 monstros +1, Arena rodadas/2 em grupo ou /4 sozinho, chefe +1, Chefe
  Mundial +5, masmorra +1, guardião da Torre +1; nível 30+) e 📜 `S.perg` (Pergaminhos de Juramento: diária +1, semanal +3).
  Conquistar = 40 🎗️ + 20 📜; evoluir `capeEvoCost`; refino com 🧵 `S.fios` (6 🎗️ cada, chance cai depois do +5, falha não perde).
  Visual: usa a capa do modelo da classe (`cfg.cape`), cor por faixa (`capeColor`: 1 couro, 4 azul, 7 carmesim, 10 dourada com brilho,
  13 roxa radiante com partículas); `vis` falso esconde até a capa padrão. Vai no `look._capa` para os outros jogadores verem. Janela `capa`.
- **Pets, montarias e itens no chão:** `S.pets {list:[{uid, sp, lvl 1–30, xp}], active}` (`PET_SP`: gosma, fada, raposa, dragão, coruja,
  espírito raro) e `S.mounts {list:[{uid, sp, lvl 1–10}], active}` (`MOUNT_SP`: cavalo, lobo, urso [Torre 30], grifo, tigre [Arena 20]).
  `petsState()` migra os antigos `S.companion`/`S.mount`/`S.owned.pet*`. Bônus em % iguais para todas as classes (`companionBonus`,
  moderados: ~8% no máximo). Ovos na loja (`ovo1`, `ovo2`) e de chefes (`maybeEgg`); pet ganha XP por abate (`petGainXp`) e com petisco
  (`feedPet`); montaria sobe com ouro + minério (`mountUp`), velocidade em `mountSpeed()`.
  **Itens no chão:** dentro do `killMonster` existe `R.lootCtx` (posição do monstro); `dropItem`/`dropGem`/`dropSoul`/`giveStones`/`giveMat`
  viram `lootSpawn` em `R.loot`. `lootTick`: o pet (`R.petPos`) corre até o item mais perto dentro do alcance (3 m + 0,15/nível, coruja ×1,6) e
  pega; o herói pega a 1,4 m; o resto chega sozinho em 12 s (com pet) ou 20 s. `flushLoot()` ao trocar de mapa/masmorra/cidade (nada se perde).
  Filtro `S.lootF` por raridade e tipo (desmarcado vira ouro se `vender`). Cena: `updateLoot`/`lootPick`, pet e montaria com visual por espécie
  (nomes `Pet ...`/`Montaria ...` em `MON`). Janela `pets` (abas Pets, Montarias, Coleta). Progresso offline continua indo direto para a mochila.
- **Vale da Fênix (só renascidos):** `RB_ZONE` (`rb`, `special`, `rebirth`), teleporte pela caixa `rbBox()` na janela de Mapas (o clique em
  `data-zone` recusa sem `S.rebirths`). Monstros no nível do herói (ramo `special` do `spawnSource`; cristais só no `gw`), chefe Fênix Ancestral no
  nível do herói +3 (`spawnBoss` com `z.special`), +50% XP e +30% ouro, **Penas de Fênix** (`S.feathers`: 12% comum, 60% elite, 5 chefe) trocadas em
  `FEATHER_SHOP` (Ovo Ancestral 50, Pedra da Alma nv3 6, 5 insígnias 3). Heróis de teste vêm com `rebirths = 3`. Título "Asas da Fênix".
- **Ameaça dos renascidos:** `RB_THREAT` (`hp 0.3`, `atk 0.2`, `rw 0.15` por ★, até ★10) aplicada no fim de `makeMonster` (`rbScale`) em todo
  lugar; `dropMult()` também sobe. **Dificuldades do Vale:** `RB_DIFF[1..3]` (Normal ★1, Heroico ★2: +5 níveis, vida ×1,5, ataque ×1,25, penas ×2;
  Lendário ★3: +10 níveis, vida ×2, ataque ×1,5, penas ×3, chefe `m.legend` com marcas 30% mais rápidas e Ovo Raro garantido). `S.rbDiff`,
  `rbDiff()` cai para Normal sem ★ suficiente; botões `data-rbdiff` no `rbBox()`. Calibrar com `tools/test/rebirth.cjs` (alvo: herói médio nv100
  sente o Lendário — sem poção pode morrer; herói Full tranquilo).
- **Guardado para depois:** tudo é coletado desde o nível 1 (insígnias, pergaminhos, selos, pedras da Alma), mesmo com o sistema trancado.
  `LATER` (alma → `UNLOCK.alma`, capa → `CAPE_LVL`, ordem → `ROSARY_LVL`), `laterNote(id)` no texto do log, `laterBox()` no topo da Mochila,
  `laterUnlocks()` (em `renderAll`, marca `S.unlL`) avisa ao liberar quanto já foi guardado. Não trave coleta por nível: trave só o uso.
- **Impacto:** `st.hitstop` (pausa curta: o `dt` das animações cai), `e.kbv` (recuo do monstro), `flashScreen()` (`#hit-flash`), arremesso ao morrer.
- **PWA:** `manifest.webmanifest`, `sw.js` (rede primeiro, cache como reserva; **aumente `VERSAO` ao publicar no servidor próprio**),
  ícones em `assets/icons/`. O service worker só registra fora de iframe (no link do claude.ai a instalação não aparece; no domínio próprio, sim).

## Multiplayer (Fase 5)
- **Servidor** (`server/server.js`): `GET /api/ping`, `POST /api/register|login` (senha com scrypt, sessões de 30 dias em `db.tokens`),
  `GET /api/me`, `GET|PUT|DELETE /api/save/0..2` (validação básica em `validSave`), `GET /api/ranking` (renascimentos > nível > abates).
  WebSocket `/ws?token=`: o cliente manda `{t:'state', ...}` 5×/s e `{t:'chat', text, ch:'global'|'zone'}`; o servidor manda `{t:'players', list, online}`
  só com quem está na mesma sala (`roomOf`: mapa, cidade da facção; masmorra é privada), `{t:'chat'}` e `{t:'sys'}`. Limites contra abuso em `limited`.
  Ao servir `index.html`, injeta `window.VALDARIA_SERVER = true` (sem isso o cliente nem tenta conectar — evita erro 404 no link do claude.ai).
  Nunca sirva `server/`, `build/`, `node_modules` ou arquivos ocultos (`serveStatic`).
- **Cliente:** `online()` em `game.js` decide entre nuvem (`Net.st.slots`) e localStorage em `loadSlot`/`writeSlot`/`save`/`deleteSlot`.
  `renderAccount` (login/criar conta, enviar heróis do aparelho para a conta), `netState()` envia a presença, `Net.onChat`/`onSys` caem no chat,
  `tabRanking`. Na cena, `updateOthers` desenha os outros jogadores (`buildHeroModel(cls, look)`), com nome em `#pl-labels`.
- O servidor ainda **confia no cliente** (nível, ouro). Próximo passo para anti-trapaça: o servidor calcular combate, XP e drops.

### Grupos e guildas
- **Servidor:** grupos em memória (`parties`, até 4; `pinvite`/`paccept`/`pleave`; a lista do grupo vai junto na mensagem `players` 5×/s
  com vida e mapa de cada um). `pshare` repassa XP/ouro a quem do grupo está na mesma sala. Guildas salvas em `db.guilds`
  (`gcreate` nível 20, `ginvite`/`gaccept`, `gleave`, `gkick` só do líder; até 30 membros; `pushGuild` manda a visão com quem está online).
  Chat com canais `global`, `zone`, `party`, `guild`. Ranking mostra a guilda. Mensagens sociais têm limite por conta.
- **Cliente:** `Net.soc(tipo, dados)`, `Net.shareKill` (junta e envia a cada 2 s), `Net.onSocial`. No jogo: janela `social` (tecla G, botão 👥),
  `renderPartyHud` (barras dos colegas), `socialXp()` (+10% por colega no mesmo mapa × guilda +2% por membro online até 10%),
  abates mandam 15% do XP e 10% do ouro ao grupo. Chat: `/p`, `/g`, `/convidar Nome`, `/convidarguilda Nome`, `/sairgrupo`.
  Fundar guilda custa `GUILD_COST` (50.000) cobrado quando o servidor confirma (`gcreated`).
- **Masmorra em grupo:** só o líder do grupo abre (`canCoop`, botão "👥 Em grupo" na janela de mapas → `startCoop`). O líder simula tudo
  (`R.coop.lead`, monstros com vida × `coopScale()`), manda `crelay` `sync` 5×/s; colegas entram com `joinCoop` (convite `start`), não rodam
  `monstersAI`/`dungeonTick` (`isMember()`), espelham os monstros (`coopApplySync`), são atacados pelos que estão perto (`coopMemberTick`) e
  mandam o dano junto a cada 0,2 s (`hit`). O líder aplica, mata e manda `kill` — cada colega ganha o prêmio completo (`killMonster` com `coopKill`).
  `exitDungeon` manda `end` (líder, com `done` → colegas recebem `dungeonReward`) ou `leave`. No servidor, a sala da masmorra é `coop_<grupo>`
  para os jogadores se verem lá dentro. Sem notícia do líder por 8 s o colega sai.
- **PK (combate entre jogadores):** só com `S.settings.pk` ligado dos dois lados, nos mapas `PK_ZONES` (z8, z9, z10, b4, e1), a partir do
  nível 40, nunca na cidade/masmorra, nunca no mesmo grupo ou guilda, e não em quem acabou de voltar (proteção). Cliente: tocar no jogador
  (`userData.pid` na cena → `gameOrder({type:'pvp'})`), `pvpStep` no `playerAI` (anda até ele, usa o golpe de dano mais forte pronto; dano =
  ataque × golpe × `100/(100 + defesa×0,25)` × `PVP_SCALE`), `onPvpHit` (aplica bloqueio, resistência, escudo de mana e Laço de Equipe; no Auto
  revida), morte no PK sem perder XP nem itens (volta em `PVP_RESPAWN` s com proteção `PVP_PROT`). Servidor: `canPk` confere tudo (inclusive
  distância ≤ 11) antes de repassar `pvphit`; `pvpdead` dá Honra (`db.users[].honor`) a quem bateu nos últimos 15 s e avisa o mapa.
  Estado manda `pk`, `prot`, `pd` (defesa) e `pe` (esquiva). Caixa `pkBox()` na janela Social, `/pk` no chat, etiqueta "⚔️ PK" no título do mapa,
  nome vermelho e barra de vida do alvo na cena, Honra no ranking.
- **Cerco da Coroa (clã × clã):** inspirado em guerra de castelo, com nome próprio. Domingo das 17h às 18h, horário de Brasília (`EVENT_TZ`;
  `GW_FORCE=1` deixa aberto para testes). Mapa especial `GW_ZONE` (`gw`, Fortaleza da Coroa, `special`, monstros no nível de quem entra,
  25% são **Cristais da Coroa** parados, `m.crystal`/`m.static`, visual `crystal`). Entrar só com guilda (`enterGW`); no fim volta para `S.gwBack`
  (`gwTick`). Pontos no servidor (`gwscore`: cristal 50, monstro 1; PK no Cerco 20 via `pvpdead`). Lá, clãs diferentes lutam **sem** Modo PK
  (`gwPk` no servidor, `pkWhyNot`/`pkActive` no cliente; a lista de jogadores manda a guilda em `g`). `gwRoll` abre e fecha; o resultado
  (`db.gw.result.top`) dá +10% / +6% / +3% de XP e drop ao 1º/2º/3º clã até o próximo Cerco. Teste do fim: `tools/test/cerco.cjs`.
- **Arena da Sobrevivência:** inspirada em arena de sobrevivência, com nome próprio. `enterArena(grupo)`, `R.dungeon.arena`, rodadas
  (`arenaFloor`: monstros no nível do herói, mais fortes a cada rodada, chefe a cada 5, tempo `D.t`), `arenaClear` (ouro; item e pedra da
  Alma), `arenaFinish` ao sair (pedras pelo total; o líder do grupo manda `sodscore`). 3 entradas por semana (`S.arenaWk`). Em grupo usa a
  infra da masmorra em grupo (`crelay start` com `arena: true`). Limite do servidor: 450 `crelay` por 10 s (início/fim/saída têm limite
  próprio e nunca se perdem) — antes, numa luta com muitos abates, o fim da Arena era descartado e o colega ficava preso. O servidor guarda o recorde semanal de grupo (`db.sod.best`, só grupos de
  2+); os campeões da semana passada (`db.sod.prev`) ganham +2% de XP e drop.
- **Bônus da semana:** mensagem `wk` a cada 5 s (aberto/placar/rei/recordes e `gwB` + `sod`); `wkBonus()` soma no XP (`derived`) e
  `dropMult()` multiplica as chances de item, gema e pedra da Alma. Caixas `gwBox()` e `arenaBox()` na janela de Mapas.
- **Trocas:** `tinvite`/`taccept` abrem a sessão no servidor (`trades`), `toffer` (até 8 itens + ouro; mudar destrava os dois), `tlock`, `tconfirm`;
  com os dois confirmados o servidor manda `tdone` a cada lado (`tradeDone` tira o que deu e põe o que recebeu com uid novo). Janela `troca`,
  botão 🤝 na janela Social e `/trocar Nome`. Sair do jogo cancela a troca.
