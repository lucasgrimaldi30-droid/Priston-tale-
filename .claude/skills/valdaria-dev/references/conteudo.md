# Adicionar conteúdo e balancear

## Classe
`CLASSES` em `js/data.js`: `name, faction ('ferro'|'luz'), icon, weapon, role, desc, base {for,int,des,agi,vit}, main, speed, skills` e opcionais
`anyWeapon`, `critMult`. Depois: `LOOK` (aparência procedural, em `scene.js`), `HERO_MODEL` (modelo KayKit e peças padrão, em `scene3d.js`),
`heroAttackClip` se for um tipo de arma novo, e o arquétipo do item inicial (`makeStarterWeapon`).

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
- `node tools/test/balance.cjs 24`: **nível ~45–56 em 24 h** de jogo contínuo no Auto (com pontos de habilidade automáticos), poucas mortes (< 30), nenhuma classe muito à frente.
- Se uma classe travar sem morrer, procure laços: chefe que cura, alvo inalcançável ou missão impossível ocupando espaço.
- XP por nível: `xpNeed(l) = 40·l^2,6 (+8%/nível acima de 79) + 60`. Monstros do mundo: vida ×0,55, ataque ×0,5, XP ×0,78 (×0,6 do grupo ×1,3 do mundo).
- Missões: caçada = 12% do XP do nível; chefe = 35%.
- Ouro sobra no fim do jogo (só o refino gasta): ponto conhecido para melhorar.
