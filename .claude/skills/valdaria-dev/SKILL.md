---
name: valdaria-dev
description: Guia para desenvolver, testar, balancear e publicar "Crônicas de Valdária", o MMORPG de navegador deste repositório (mundo aberto isométrico com modo automático, 8 classes, combate em grupo, equipamento visível por tier, cidades, missões, interface de MMO, cena 3D com Three.js e modelos KayKit). Use sempre que for mexer no jogo — adicionar classe, habilidade, monstro, mapa, item, missão ou NPC, corrigir bug, ajustar balanceamento, rodar testes, publicar uma nova versão ou planejar as próximas fases.
---

# Crônicas de Valdária — guia de desenvolvimento

MMORPG de navegador em HTML + JavaScript puro, **sem etapa de build**. O jogador anda pelo mapa (tocar no chão e nos monstros) ou liga o **modo Auto**,
que caça sozinho e mantém o progresso offline. Referência de estilo do dono do projeto: MMOs de navegador com câmera isométrica (tipo Eldevin).

## Antes de começar
1. **Converse em português do Brasil**, em passos curtos. O dono do projeto costuma estar no **celular**: explique o resultado sem jargão e ofereça o próximo passo.
2. **Conteúdo sempre original.** Pode reproduzir *mecânicas* (funções de classe, área, invocação, furtividade, bloqueio, missões), mas nunca nomes, classes,
   tribos, cidades, mapas, monstros, arte ou música de jogos existentes, nem renomeados. Se pedirem "uma cópia de X", explique e proponha a versão original.
3. Leia a referência certa antes de mexer:
   - `references/arquitetura.md` — arquivos, estado (`S`/`R`), funções principais de cada sistema.
   - `references/conteudo.md` — como adicionar classe, habilidade, monstro, mapa, item, missão ou NPC, e as metas de balanceamento.
   - `references/roadmap.md` — fases feitas e planejadas, decisões já tomadas, divisão do trabalho com o dono.

## Regras que já custaram bugs
- **Nunca use `confirm()`, `prompt()` ou `alert()`.** A página publicada roda num iframe sem `allow-modals` e o navegador ignora em silêncio.
  Use `uiDialog()` / `uiConfirm()` (em `js/game.js`).
- O `localStorage` pode falhar no iframe: `loadSlot`/`save` já caem para `memSlots`. Não acesse `localStorage` direto sem `try/catch`.
- Nomes de ossos dos modelos vêm **sem ponto** (`handslotr`, `upperarml`, `lowerlegl`…). O GLTFLoader remove os pontos.
- Classes de CSS da interface já colidiram com nomes genéricos (`.skill`): use prefixos (`lg-`, `fx-`).
- Estado novo em `S` precisa de valor padrão para saves antigos (veja a migração em `startGame`).
- Chefes nunca devem prender o modo Auto num laço de morte: o chefe que vence some (`die`), e o Auto só ataca chefe desafiado ou que já está atacando.

## Rodar e testar
```bash
python3 -m http.server 8000          # jogar: http://localhost:8000 (modelos 3D precisam de HTTP)
node tools/test/smoke.cjs            # teste completo: 8 classes, cidade, NPC, janelas, Conta Full em iframe, celular
node tools/test/smoke.cjs --rapido   # versão curta (~1 min)
node tools/test/balance.cjs 24       # simulação de 24 h por classe; ou: node tools/test/balance.cjs 12 lanceiro,arcanista
node --check js/*.js                 # sintaxe
```
O teste de navegador sai com código 1 se houver erro no console e salva capturas em `build/test/`. **Olhe as capturas** antes de dizer que ficou bom.
Para depurar à mão, no console da página: `localStorage.clear(); slot=0; S=newCharacter('X','lanceiro'); S.lvl=50; save(); startGame(0)`.
`tick()` avança 0,1 s de jogo (36000 = 1 h). Para ver o equipamento de perto: `window.__camFocusHero = true` e zoom com a roda do mouse.

## Publicar (link do claude.ai)
O publicador não serve `.glb`. Gere cópias glTF em JSON (o jogo tenta `.glb` e cai para `.json`):
```bash
(cd tools && npm i @gltf-transform/core@4.1.1 @gltf-transform/extensions@4.1.1) && node tools/models-to-json.mjs build/models-json
```
Publique `index.html` (Artifact, mesmo arquivo para manter o link) com `files`: `css/style.css`, `js/data.js`, `js/audio.js`, `js/scene.js`,
`js/scene3d.js`, `js/game.js`, `js/vendor/three.min.js`, `js/vendor/GLTFLoader.js`, `js/vendor/SkeletonUtils.js` e cada
`assets/models/<Nome>.json` → `build/models-json/<Nome>.json`. Numa atualização, basta enviar os arquivos que mudaram.
Link atual: https://claude.ai/artifact/WujEedKd9zmdsGRmU8Rwq6. Num servidor próprio, sirva a pasta como estática (usa o `.glb` direto).

## Fluxo de trabalho
1. Mude o código. 2. `node --check js/*.js`. 3. `node tools/test/smoke.cjs` e confira as capturas. 4. Se mexeu em combate, XP ou drops,
rode `tools/test/balance.cjs`. 5. Commit (mensagem em português) e push no branch de trabalho. 6. Publique. 7. Atualize esta skill e as referências
quando mudar algo estrutural (nova fase, novo sistema, nova regra).
