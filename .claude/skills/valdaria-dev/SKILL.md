---
name: valdaria-dev
description: Como desenvolver, testar, balancear e publicar o idle MMORPG "Crônicas de Valdária" deste repositório (classes, habilidades, monstros, equipamentos, cena 3D com modelos KayKit, cidades, áudio e a conta Full de demonstração). Use sempre que for mexer no jogo, adicionar conteúdo, corrigir bugs, rodar testes visuais ou subir uma nova versão.
---

# Crônicas de Valdária — guia de desenvolvimento

Idle MMORPG de navegador, sem build: HTML + JS puro. Abra pelo servidor local (os modelos 3D precisam de HTTP).

## Regra de conteúdo
O jogo é **original e inspirado** no gênero dos MMORPGs clássicos. Pode copiar mecânicas (funções de classe, área, invocações, furtividade, bloqueio etc.),
mas **não** use nomes, personagens, mapas, monstros, arte ou música de jogos existentes (ex.: tribos, cidades, classes e skills de outro MMORPG), nem renomeados.

## Arquitetura
| Arquivo | Conteúdo |
|---|---|
| `js/data.js` | `FACTIONS`, `CLASSES` (atributos, habilidades), `MON_TYPES`/`MON_TYPE`, `PETS`, `CITIES`, `ZONES`, `RARITIES`, nomes de armas/armaduras, `AFFIXES`, `SHOP` |
| `js/game.js` | Estado salvo `S` e de execução `R`, combate em grupo (`spawnMonster`, `playerHit`, `hitMonster`, `monsterHit`, `killMonster`, `trySkills`, `tick`), itens, refino, cidade/NPCs, UI, save, progresso offline, conta Full (`createFullAccount`) |
| `js/scene3d.js` | Cena 3D (Three.js r128): cenários por mapa, cidades por facção, NPCs, câmera livre, modelos KayKit e animações, equipamento por tier (`buildWeaponT`, `buildShieldT`, `buildHelmetModel`, `attachArmor`), grupos (`st.ents`), invocações (`st.pet`), efeitos e partículas. No fim fica a fachada `Scene` que escolhe 3D ou 2D |
| `js/scene.js` | Cena 2D (canvas), reserva para aparelhos fracos ou sem WebGL (`Scene2D`) |
| `js/audio.js` | Efeitos e músicas procedurais (`Sfx.play`, `Sfx.music`) |
| `assets/models/` | Modelos .glb otimizados (KayKit, CC0) + `anims.glb` (animações compartilhadas) + `skel_props.glb` |
| `js/vendor/` | three.min.js r128, GLTFLoader, SkeletonUtils (sem CDN) |

### Habilidades (`CLASSES[x].skills`)
Tipos: `dmg` (alvo único; `hits`, `boss`, `holy`), `aoe` (todos; `targets`, `stun`, `slow`, `healPct`), `buff` (`stat` + `also`), `heal`, `summon` (`pet`: golem/falcao/fera), `stealth`, `passive` (`stat`/`val` ou `revive`).
Stats de buff aceitos em `derived()`: atk, def, crit, critdmg, spd, evade, block, absorb, reflect, hpmax, undead, mshield.
A IA de uso fica em `trySkills`: cura < 60% de vida, invocação, furtividade, buffs, e depois dano (área quando há 2+ monstros).

### Equipamento visual
Tier = `floor(ilvl/17)` (0–5). Cada tipo de arma tem 6 visuais em `W_BUILD` (foice, arco, espada, machado, martelo, dardo, cajado, cetro).
Raridade dá a cor do brilho, e o refino aumenta a intensidade. Armadura, elmo, luvas, botas, escudo, amuleto e anel são presos aos ossos do modelo
(nomes sem ponto: `handslotr`, `handslotl`, `head`, `chest`, `upperarml`, `wristr`, `lowerlegl`...). O herói é reconstruído quando `equipSig()` muda.

## Testar
```bash
python3 -m http.server 8765   # na raiz do repositório
```
Playwright já vem instalado no ambiente. Use `chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })` para o WebGL.
Para criar um herói no teste: `localStorage.clear(); slot=0; S=newCharacter('X','lanceiro'); S.lvl=50; save(); startGame(0)`.
Para ver o equipamento de perto, defina `window.__camFocusHero = true` e role a roda do mouse no `#scene3d` (eventos `WheelEvent`).
Uma chamada `tick()` equivale a 0,1 s de jogo, então dá para simular horas num loop (36000 ticks = 1 h).
Alvos de balanceamento (simulação jogando sozinho com auto-equipar e mapa ideal): nível ~50–60 em 24 h e ~55–72 em 48 h, poucas mortes, nenhuma classe muito à frente.

**Nunca use `confirm()`, `prompt()` ou `alert()`**: a página publicada roda num iframe sem `allow-modals`, e o navegador ignora essas chamadas em silêncio. Use `uiDialog()` / `uiConfirm()` de `js/game.js`. Para reproduzir esse ambiente, carregue o jogo dentro de `<iframe sandbox="allow-scripts allow-same-origin allow-popups allow-forms">`.
O `localStorage` pode falhar nesse ambiente; `loadSlot`/`save` caem para `memSlots` (memória).

Sempre confira: `node --check js/*.js`, nenhum `pageerror` no console, capturas das 8 classes e das duas cidades, modo 2D e celular (390×844).

## Modelos 3D
Os originais são KayKit Adventurers e Skeletons (CC0). O pipeline usou `@gltf-transform`: remover as animações dos personagens, juntar 32 clipes em `anims.glb`,
`resample` + `quantize`. Todos usam o mesmo esqueleto, então um clipe serve para qualquer modelo. O loader tenta `.glb` e, se falhar, `.json`.

## Publicar (Artifact do claude.ai)
O Artifact não serve `.glb`. Gere as cópias JSON e publique mapeando `assets/models/<Nome>.json`:
```bash
(cd tools && npm i @gltf-transform/core@4.1.1 @gltf-transform/extensions@4.1.1) && node tools/models-to-json.mjs build/models-json
```
Publique `index.html` com `files`: css/style.css, js/data.js, js/audio.js, js/scene.js, js/scene3d.js, js/game.js, js/vendor/*.js e
`assets/models/*.json` → `build/models-json/*.json`. Link atual do jogo: https://claude.ai/artifact/WujEedKd9zmdsGRmU8Rwq6
Num servidor próprio basta servir a pasta como arquivos estáticos (o `.glb` é usado direto).

## Conta Full
O botão "⭐ Conta Full de demonstração" na seleção de personagens cria Engenheiro, Lanceiro e Arcanista no nível 100, com tudo lendário +10
(`makeFullChar`). Para mudar as classes da conta, altere `createFullAccount` em `js/game.js`.
