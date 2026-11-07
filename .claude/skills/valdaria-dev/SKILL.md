---
name: valdaria-dev
description: Guia para desenvolver, testar, balancear e publicar "Crônicas de Valdária", o MMORPG de navegador deste repositório — mundo aberto isométrico com modo Auto, 8 classes com habilidades de nível 1–10, combate em grupo, elites, chefes com marcas no chão, masmorras, equipamento visível por tier, conjuntos, gemas e forja, missões e diárias, renascimento, conquistas, mapas ligados, eventos, coleta, grupos, guildas, trocas, artefatos e Alma equilibrados por classe, interface de MMO, cena 3D (Three.js + modelos KayKit) e app instalável (PWA). Use sempre que for mexer no jogo — adicionar classe, habilidade, monstro, mapa, item, missão, NPC ou sistema; corrigir bug; ajustar balanceamento ou efeitos visuais; rodar testes; publicar uma nova versão; ou planejar as próximas fases.
---

# Crônicas de Valdária — guia de desenvolvimento

MMORPG de navegador em HTML + JavaScript puro, **sem etapa de build**. O jogador anda pelo mapa (tocar no chão e nos monstros) ou liga o
**modo Auto**, que caça sozinho, faz missões e mantém o progresso offline (8 h). Referência de estilo do dono: MMOs de navegador com câmera
isométrica (tipo Eldevin), com mecânicas de MMORPGs clássicos — mas sempre com conteúdo próprio.

## Como o dono do projeto trabalha
- Fala **português do Brasil** e quase sempre está no **celular**. Responda curto, sem jargão, com o resultado e o próximo passo.
- Costuma pedir "faz tudo": faça em blocos, **teste cada bloco**, publique no mesmo link e diga claramente o que ficou de fora e por quê.
- Gosta de ver o jogo funcionando: depois de cada mudança relevante, publique (veja "Publicar") e passe o link.
- Vai revisar **golpe por golpe** cada classe; ajustes de efeito ficam em `SFX` (`js/scene3d.js`) e números em `CLASSES` (`js/data.js`).
- Modelos 3D de personagens humanos e de monstros ficam **para o final** (ver `references/roadmap.md`).
- Quer tudo **equilibrado por personagem**: sistemas de bônus (Alma, artefatos) devem reforçar o ponto fraco de cada classe —
  quem bate muito busca defesa, quem é mago com vitalidade busca ataque (`CLASS_BUILD` em `references/conteudo.md`).
- Às vezes traz ideias de outros jogos (vídeos, prints). Pergunte como funciona, proponha a versão própria e só faça depois do "pode fazer".

## Regras de conteúdo
Pode reproduzir *mecânicas* de outros jogos (funções de classe, área, invocação, furtividade, bloqueio, missões, renascimento...), mas nunca nomes,
classes, tribos, cidades, mapas, monstros, arte ou música de jogos existentes, nem renomeados. Se pedirem "uma cópia de X", explique e proponha a
versão original com as mesmas mecânicas (ex.: guerra de castelo virou "Cerco da Coroa" e arena de sobrevivência virou "Arena da Sobrevivência").

## Referências (leia a certa antes de mexer)
- `references/arquitetura.md` — arquivos, estado salvo (`S`) e de execução (`R`), laço do jogo e funções de cada sistema.
- `references/conteudo.md` — receitas para adicionar classe, habilidade, monstro, mapa, item, conjunto, gema, missão, diária, conquista, NPC e item de loja; metas de balanceamento.
- `references/roadmap.md` — o que já existe, o que está planejado, ideias ainda não feitas e a divisão do trabalho com o dono.

## Regras que já custaram bugs
- **Nunca use `confirm()`, `prompt()` ou `alert()`**: a página publicada roda num iframe sem `allow-modals` e o navegador ignora em silêncio.
  Use `uiDialog()` / `uiConfirm()`.
- O `localStorage` pode falhar no iframe: `loadSlot`/`save` já caem para `memSlots`. Não acesse `localStorage` sem `try/catch`.
- **Funções duplicadas:** em JS a última declaração vence em silêncio (uma cópia antiga de `retarget()` fez o herói atacar com o Auto desligado).
  Ao reescrever um sistema, apague a versão antiga. `tools/test/features.cjs` verifica isso.
- Em combate use sempre `classSkills()` (aplica o nível da habilidade), nunca `CLASSES[x].skills` direto.
- Estado novo em `S` precisa de valor padrão para saves antigos (migração em `startGame`) — por exemplo `S.settings.autoSkill`.
- Modo Auto desligado = o herói só ataca o que o jogador tocar. Auto ligado sai sozinho das marcas de chefe (`autoDodge`).
- **Laços infinitos de balanceamento:** chefe que curava ao voltar à arena, Auto desafiando chefe sem nível, missão impossível ocupando vaga.
  Se a simulação mostrar uma classe travada sem morrer, procure laços assim.
- Nomes de ossos dos modelos vêm **sem ponto** (`handslotr`, `upperarml`…). Classes de CSS usam prefixos (`lg-`, `fx-`) para não colidir.
- Ao mudar arquivos servidos pelo app instalado, aumente `VERSAO` em `sw.js`.
- Nada de console com erro no modo offline: o cliente só procura o servidor quando a página traz `window.VALDARIA_SERVER`.
- Texto vindo de outros jogadores (nome, chat, título) **sempre** passa por `esc()` antes de ir para o HTML.
- No ambiente de nuvem do Claude, `docker build` falha no `npm install` por causa do certificado do proxy (não é erro do Dockerfile);
  para testar, use uma cópia do Dockerfile que copie `/root/.ccr/ca-bundle.crt` e rode `npm config set cafile` antes.

## Rodar e testar
```bash
python3 -m http.server 8000          # jogar: http://localhost:8000 (modelos 3D precisam de HTTP)
node tools/test/features.cjs         # sistemas (tutorial, habilidades, loja, forja, gemas, chefe, masmorra, diárias, login, conjuntos, renascimento, PWA, duplicatas) ~20 s
node tools/test/smoke.cjs            # navegador: 8 classes, cidade, NPC, janelas, Conta Full em iframe, celular (~3 min); --rapido para ~1 min
node tools/test/balance.cjs 24       # simulação de 24 h por classe (ou: node tools/test/balance.cjs 12 lanceiro,arcanista)
node tools/test/danger.cjs           # Fenda Primordial: médio solo × médio em equipe × muito forte (5 min cada)
node tools/test/cerco.cjs            # fim do Cerco da Coroa: Rei da Semana e bônus (sobe o servidor duas vezes)
node tools/test/multiplayer.cjs      # sobe o servidor e testa 2 jogadores: presença, chat, save na nuvem, ranking, segurança (cd server && npm install antes)
cd server && npm install && node server.js   # jogar online localmente em http://localhost:8080
node --check js/*.js                 # sintaxe
```
Os testes saem com código 1 se algo falhar. O smoke salva capturas em `build/test/` — **olhe as capturas** antes de dizer que ficou bom.
Depurar à mão (console da página): `localStorage.clear(); slot=0; S=newCharacter('X','lanceiro'); S.lvl=50; S.tut=99; save(); startGame(0)`.
`tick()` avança 0,1 s (36000 = 1 h). Equipamento de perto: `window.__camFocusHero = true` + roda do mouse.

## Publicar (link do claude.ai)
O publicador não serve `.glb`: gere cópias glTF em JSON (o jogo tenta `.glb` e cai para `.json`):
```bash
(cd tools && npm i @gltf-transform/core@4.1.1 @gltf-transform/extensions@4.1.1) && node tools/models-to-json.mjs build/models-json
```
Publique `index.html` (Artifact, sempre o mesmo arquivo para manter o link) com `files`: `css/style.css`, `js/data.js`, `js/audio.js`,
`js/scene.js`, `js/scene3d.js`, `js/game.js`, `manifest.webmanifest`, `sw.js`, `assets/icons/*.png`, `js/vendor/*.js` e cada
`assets/models/<Nome>.json` → `build/models-json/<Nome>.json`. Numa atualização, envie só o que mudou.
Link atual: https://claude.ai/artifact/WujEedKd9zmdsGRmU8Rwq6. No link do claude.ai o app não é instalável (roda em iframe); num servidor
próprio, use o servidor do jogo (`DEPLOY.md`: Docker + Caddy com HTTPS) — aí o multiplayer e o PWA funcionam.

## Fluxo de trabalho
1. Mude o código. 2. `node --check js/*.js`. 3. `node tools/test/features.cjs`. 4. `node tools/test/smoke.cjs` e confira as capturas.
5. Mexeu em combate, XP, drops, monstros ou chefes? Rode `tools/test/balance.cjs`. 6. Commit (mensagem em português) e push no branch de trabalho.
7. Publique. 8. Atualize esta skill e as referências quando mudar algo estrutural (sistema novo, regra nova, fase nova).
