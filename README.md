# Crônicas de Valdária — Idle MMORPG

Idle MMORPG de navegador inspirado nos MMORPGs clássicos de fantasia. Não precisa instalar nada: abra o `index.html` no navegador.

## Como jogar
- Crie até **3 heróis**. Escolha a facção (**Clã de Ferrovale** ou **Ordem de Lumínia**) e uma das **8 classes**:
  - Ferrovale: Gladiador (machado), Engenheiro (martelo), Caçadora (arco), Lanceiro (lança)
  - Lumínia: Paladino (espada), Valquíria (dardo), Arcanista (cajado), Clériga (cetro)
- **Cena de batalha animada em 2D (canvas)**: o herói é desenhado de acordo com a classe e luta de verdade — investidas corpo a corpo, flechas, dardos e magias, efeitos de habilidades, partículas, números de dano, tremor de tela nos críticos e cenário com parallax para cada mapa.
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
- `js/scene.js` — cena de batalha animada (canvas 2D)
- `js/game.js` — motor do jogo (combate, drops, níveis, save, interface)
