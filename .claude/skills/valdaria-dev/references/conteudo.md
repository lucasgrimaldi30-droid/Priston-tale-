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

## NPC da cidade
`NPCS` (`game.js`: nome, ícone, aba, fala), botão em `#npc-bar` (`index.html`), e em `scene3d.js`: `NPC_LOOK` (posição), `NPC_NAMES`, `NPC_ICON`,
`NPC_MODEL`. Posição também no minimapa da cidade (`drawMinimap`).

## Balanceamento (metas atuais)
- `node tools/test/balance.cjs 24`: **nível ~44–55 em 24 h** de jogo contínuo no Auto, poucas mortes (< 50), nenhuma classe muito à frente.
- XP por nível: `xpNeed(l) = 40·l^2,6 (+8%/nível acima de 79) + 60`. Monstros do mundo: vida ×0,55, ataque ×0,5, XP ×0,78 (×0,6 do grupo ×1,3 do mundo).
- Missões: caçada = 12% do XP do nível; chefe = 35%.
- Ouro sobra no fim do jogo (só o refino gasta): ponto conhecido para melhorar.
