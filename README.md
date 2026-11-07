# Crônicas de Valdária — Idle MMORPG

Idle MMORPG de navegador inspirado nos MMORPGs clássicos de fantasia. Não precisa instalar nada: abra o `index.html` no navegador.

## Como jogar
- Crie até **3 heróis**. Escolha a facção (**Clã de Ferrovale** ou **Ordem de Lumínia**) e uma das **8 classes**:
  - Ferrovale: Gladiador (machado), Engenheiro (martelo), Caçadora (arco), Lanceiro (lança)
  - Lumínia: Paladino (espada), Valquíria (dardo), Arcanista (cajado), Clériga (cetro)
- **Batalha em 3D (Three.js)**: herói 3D montado por classe com esqueleto animado, 40 monstros em 12 tipos de corpo, cenários 3D por mapa com sombras, neblina e parallax, projéteis, partículas e números de dano. Versão 2D (canvas) disponível nas configurações para aparelhos mais fracos.
- **Cena 2D alternativa**: o herói é desenhado de acordo com a classe e luta de verdade — investidas corpo a corpo, flechas, dardos e magias, efeitos de habilidades, partículas, números de dano, tremor de tela nos críticos e cenário com parallax para cada mapa.
- O combate é automático. A cada nível você ganha **5 pontos** para Força, Intelecto, Destreza, Agilidade e Vitalidade (ou use o botão **Auto**).
- **10 mapas** do nível 1 ao 100, cada um com um **chefe** (pode ser desafiado após 25 abates).
- **6 habilidades por classe**, liberadas por nível e usadas automaticamente (ataques, buffs e curas).
- Drops com raridade **Comum → Mágico → Raro → Épico → Lendário**, com atributos bônus.
- **Refino** de equipamentos até +10 usando Pedras de Refino.
- Loja de poções com uso e compra automáticos.
- **Progresso offline** de até 8 horas e save automático no navegador (com exportar/importar).

## Estrutura
- `index.html` — telas e layout
- `css/style.css` — visual
- `js/data.js` — classes, habilidades, mapas, itens e loja (fácil de editar)
- `js/scene3d.js` — cena de batalha 3D (Three.js) e seletor 3D/2D
- `js/scene.js` — cena de batalha 2D (canvas)
- `js/game.js` — motor do jogo (combate, drops, níveis, save, interface)
