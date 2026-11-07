# Crônicas de Valdária — Idle MMORPG

Idle MMORPG de navegador inspirado nos MMORPGs clássicos de fantasia. Não precisa instalar nada: abra o `index.html` no navegador.

## Como jogar
- Crie até **3 heróis**. Escolha a facção (**Clã de Ferrovale** ou **Ordem de Lumínia**) e uma das **8 classes**:
  - Ferrovale: Gladiador (machado), Engenheiro (qualquer arma), Caçadora (arco), Lanceiro (foice)
  - Lumínia: Paladino (espada e escudo), Valquíria (dardo e escudo), Arcanista (cajado), Clériga (cetro)
- **Batalha em 3D (Three.js)**: herói 3D montado por classe com esqueleto animado, 40 monstros em 12 tipos de corpo, cenários 3D por mapa com sombras, neblina e parallax, projéteis, partículas e números de dano. Versão 2D (canvas) disponível nas configurações para aparelhos mais fracos.
- **Cena 2D alternativa**: o herói é desenhado de acordo com a classe e luta de verdade — investidas corpo a corpo, flechas, dardos e magias, efeitos de habilidades, partículas, números de dano, tremor de tela nos críticos e cenário com parallax para cada mapa.
- **Cidade de Valdária** (botão 🏰 Cidade): zona segura em 3D com fonte, casas e NPCs clicáveis. O herói anda até eles: Mercadora (loja), Ferreiro (refino), Mestre dos Portais (mapas), Sábia Mirela (habilidades e redistribuição de pontos) e o Baú (inventário).
- **Câmera livre**: arraste para girar, role a roda do mouse ou faça pinça para dar zoom, e dê dois cliques para voltar à posição padrão.
- **Equipamento visível no corpo**: armadura (cor por tier, capa a partir do tier 3, ombreiras com espinhos), elmo (6 modelos), luvas, botas, escudo, amuleto brilhante e armas maiores e com runas nos tiers altos.
- **Sons e música procedurais** (Web Audio): efeitos para golpes, flechas, magias, críticos, drops por raridade, level up e refino, e uma música para cada mapa, para a cidade e para os chefes. O volume fica nas configurações e o botão 🔊 tira o som.
- **Modelos 3D profissionais animados** (pacotes KayKit, CC0): os heróis usam Bárbaro, Cavaleiro, Mago e Ladino, e os monstros humanoides usam os Esqueletos. São 32 animações (ataques de uma e duas mãos, estocada, tiro, arremesso, magias, dano, morte, comemoração, caminhada e corrida), e as armas, escudos, elmos e capas mudam conforme o equipamento. Se os modelos não carregarem, o jogo usa os bonecos low-poly gerados por código.
- **Combate em grupo**: 2 a 4 monstros por luta (chefes vêm sozinhos), habilidades em área, atordoamento, lentidão, invocações (Autômato, Falcão, Fera Alada), furtividade, bloqueio, escudo de energia, reflexo de dano e ressurreição automática. Os monstros têm tipos (morto-vivo, fera, demônio, construto, espírito, planta), e o dano sagrado faz +50% em mortos-vivos.
- **Equipamento 100% visível**: cada tipo de arma tem 6 visuais por nível (foices e arcos novos inclusive). Elmo, armadura, luvas, botas, escudo, amuleto e anel mudam no modelo.
- **Duas cidades iniciais**: Forja de Ferrovale (Clã de Ferrovale) e Santuário de Lumínia (Ordem de Lumínia).
- **Conta Full de demonstração**: na tela de personagens, cria Engenheiro, Lanceiro e Arcanista no nível 100 com tudo lendário +10.
- **Mundo aberto isométrico**: toque no chão para andar e num monstro para atacar. O botão **🤖 Auto** faz o herói caçar sozinho, e o progresso offline continua.
- O combate pode ser automático ou manual. A cada nível você ganha **5 pontos** para Força, Intelecto, Destreza, Agilidade e Vitalidade (ou use o botão **Auto**).
- **10 mapas** do nível 1 ao 100, cada um com um **chefe** (pode ser desafiado após 25 abates).
- **6 habilidades por classe**, liberadas por nível e usadas automaticamente (ataques, buffs e curas).
- Drops com raridade **Comum → Mágico → Raro → Épico → Lendário**, com atributos bônus.
- **Refino** de equipamentos até +10 usando Pedras de Refino.
- Loja de poções com uso e compra automáticos.
- **Progresso offline** de até 8 horas e save automático no navegador (com exportar/importar).

## Desenvolvimento
O guia completo para mexer, testar e publicar está na skill `.claude/skills/valdaria-dev/` (`SKILL.md` + `references/`).

```bash
node tools/test/smoke.cjs        # teste no navegador: 8 classes, cidade, NPC, janelas, Conta Full, celular
node tools/test/balance.cjs 24   # simulação de balanceamento (24 h por classe)
```

## Rodando localmente
Os modelos 3D são carregados por HTTP, então abra o jogo por um servidor local (abrir o `index.html` direto do disco usa os bonecos simples):
```
python3 -m http.server 8000
# acesse http://localhost:8000
```

## Créditos
- Modelos 3D: **KayKit Adventurers** e **KayKit Skeletons**, de Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)), licença CC0. Veja `assets/models/LICENSE-KayKit.txt`.
- Motor 3D: [three.js](https://threejs.org) r128 (MIT), incluído em `js/vendor/`.

## Estrutura
- `index.html` — telas e layout
- `css/style.css` — visual
- `js/data.js` — classes, habilidades, mapas, itens e loja (fácil de editar)
- `js/scene3d.js` — batalha e cidade 3D (Three.js), câmera livre e seletor 3D/2D
- `assets/models/` — modelos .glb otimizados (personagens sem animação + `anims.glb` com as animações compartilhadas)
- `js/vendor/` — three.js, GLTFLoader e SkeletonUtils (sem depender de servidor externo)
- `js/audio.js` — efeitos sonoros e música procedurais
- `js/scene.js` — cena de batalha 2D (canvas)
- `js/game.js` — motor do jogo (combate, drops, níveis, save, interface)
