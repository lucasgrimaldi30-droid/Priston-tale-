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
| `tools/` | `models-to-json.mjs` (publicação) e `test/` (smoke, balance, servidor estático) |

## Estado
- `S` = personagem salvo (localStorage `valdaria_slot_N`): `cls, lvl, xp, gold, pts, attr, equip, inv, pots, stones, zone, zoneKills, bosses, quests, settings, stats, skillOff`.
  `settings`: `autoHp, autoMp, autoSell, autoBoss, autoBuyPots, autoPts, gfx, sfxVol, musVol, muted, auto, autoQuest`.
- `R` = execução (não salvo): `mons` (monstros vivos no mapa), `mon` (alvo), `pos`, `move`, `face`, `moving`, `worldZone`, `pet`, `stealth`,
  `buffs`, `cds`, `dead`, `inTown`, `npc`, `win`, `tab`, `log`, `chatTab`, `forceSkill`.
- `derived()` calcula tudo a partir de `S` + buffs + passivas: vida, mana, ataque, defesa, crítico, velocidade, esquiva, bloqueio, absorção, reflexo, escudo de mana etc.

## Laço do jogo (`tick`, 10× por segundo)
regeneração → cidade (zona segura) → `initWorld` se trocou de mapa → morte/renascer → repor monstros (`spawnWorldMonster`, limite `WORLD.cap`)
→ chefe (`spawnBoss`) → poções automáticas → `monstersAI` → invocação → `playerAI`.
A interface roda em `startLoop` (renderLive a cada tick; minimapa a cada 2; rastreador de missões a cada 10). Abas em segundo plano recuperam os ticks atrasados.

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
- Efeitos: `projectile`, `slash`, `ring`, `pillar`, partículas por shader (`spawnP`, `burst`), números (`floatAt`, DOM), `updateWorldUI` (anel do alvo, barras).
- Câmera: `updateCamera` (isométrica no mundo, fixa na cidade), controles em `bindControls` (arrastar, roda, pinça, duplo clique), toque → `pickWorld`/`pickNpc`.
- Tiers visuais: `floor(ilvl/17)` → 0–5; `TIER_COL`, `METAL`, `GRIP`; raridade dá cor e brilho, refino aumenta a intensidade.
