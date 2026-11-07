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
- **Depois do 80:** `gainXp` multiplica por `teamXpFactor()` (sozinho `SOLO_80` 22%, dupla 55%, equipe de 3+ no mesmo mapa 115%).
  **Laço de Equipe** (`teamBond`, `BOND`): cada colega no mapa = +25% de dano e −20% de dano recebido (até 3). **Despertar** (`AWK`,
  `S.awk`): 1 ponto por nível acima de 80 (Fúria, Precisão, Vigor, Bastião, Celeridade, Ruína), painel na janela do herói, automático com `autoPts`.
- **Fenda Primordial** (`e1`, desvio do Abismo Eterno, nível 85–100, `danger: true`): monstros com `DANGER` (vida ×4, ataque ×19, XP ×2,4),
  bando que percebe de 8,5 m e chama os outros; chefe com vida ×5 e ataque ×8. Calibrada com `tools/test/danger.cjs`: herói médio do 88 sozinho
  quase morre, com equipe de 3 fica tranquilo, herói muito forte (Conta Full) fica solo. O Auto sai da Fenda depois de 2 mortes sozinho.
- **Menus aos poucos:** `UNLOCK` (Conquistas nv 3, Ranking 6, Social 10, Alma 20), `applyUnlocks()` no `renderAll`; `openWin` recusa menu trancado.
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
- **Trocas:** `tinvite`/`taccept` abrem a sessão no servidor (`trades`), `toffer` (até 8 itens + ouro; mudar destrava os dois), `tlock`, `tconfirm`;
  com os dois confirmados o servidor manda `tdone` a cada lado (`tradeDone` tira o que deu e põe o que recebeu com uid novo). Janela `troca`,
  botão 🤝 na janela Social e `/trocar Nome`. Sair do jogo cancela a troca.
