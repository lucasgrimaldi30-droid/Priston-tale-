# Roadmap e decisões

## Feito
- **Base:** 8 classes em 2 facções, atributos, 10 mapas com chefes, raridades, refino +10, loja, progresso offline (8 h), 3 espaços de herói, Conta Full.
- **Visual e som:** cena 3D (Three.js) com modelos KayKit CC0 animados, cena 2D de reserva, áudio procedural, cidades por facção
  (Forja de Ferrovale, Santuário de Lumínia), equipamento visível por tier, efeito próprio por habilidade, bônus visíveis, impacto dos golpes.
- **Combate:** grupos, área, atordoar, lentidão, invocações, furtividade, bloqueio, escudo de mana, reflexo, ressurreição, tipos de monstro, elites,
  chefes com marcas no chão/fúria/reforços, masmorras de 3 andares.
- **Fase 1:** mundo aberto isométrico, tocar para andar/atacar, monstros com IA, modo Auto.
- **Fase 3:** interface de MMO em tela cheia, minimapa, chat com comandos, barra de habilidades manual, atalhos, 40 missões (Comandante Varek).
- **Fase 5 (multiplayer):** servidor Node.js com contas, saves na nuvem, presença em tempo real por mapa, chat global e do mapa, ranking,
  Docker + Caddy (HTTPS) e guia `DEPLOY.md`. Grupos (até 4, XP dividido e bônus) e guildas (salvas no servidor, chat, bônus de XP). Falta: anti-trapaça (servidor calcular combate), PostgreSQL, trocas, PvP, banco da guilda.
- **Progressão:** habilidades de nível 1–10, gemas, forja, conjuntos, montarias, mascotes, conquistas e títulos, missões diárias, prêmio de login,
  renascimento, tutorial, equipar melhores, qualidade gráfica, app instalável (PWA), especialização no nível 50, mascotes que evoluem,
  bestiário com bônus, medidor de dano e estatísticas, efeito das habilidades crescendo com o nível, Torre Infinita, eventos e chefe mundial,
  dia/noite e chuva, coleta e artesanato, mapas ligados (andar entre eles), 4 mapas escondidos, monstros vizinhos e errantes.

## Ideias sugeridas e ainda não feitas
Mais mapas escondidos · masmorra em grupo · trocas entre jogadores · eventos no servidor (hoje o relógio é do navegador).

## Pendente com o dono
- Revisão **golpe por golpe** das 8 classes (ele vai jogar e mandar os ajustes, um por vez).

## Planejado (o dono pediu para deixar os modelos de personagens e monstros para o final)
- **Multiplayer, próximos passos:** servidor autoritativo (anti-trapaça), PostgreSQL, guildas, trocas entre jogadores, PvP, grupo para masmorras.
- **Fase 2 — corpos humanos:** um masculino e um feminino, mudando só cabelo e rosto, estilo semi-realista low-poly. O dono cria no
  **MakeHuman/MPFB** e baixa animações no **Mixamo** (só no PC); nós integramos e fazemos o retarget.
- **Fase 4 — equipamentos humanos:** modelos 3D que encaixem no corpo base; visual muda **a cada 10 níveis** (10 faixas) — exige arte (comprar ou artista).
- **Fase 6 — monstros e chefes novos** em 3D.
- Ícones de itens, retratos e logo: o dono pode gerar no **Canva** (imagens 2D, PNG sem fundo); o jogo passa a usar se existirem.

## Divisão do trabalho
- **Claude:** todo o código (regras, cena, interface, servidor, integração e otimização de modelos), testes, balanceamento, publicação.
- **Dono:** arte 3D (MakeHuman, Mixamo, compra de pacotes ou artista), imagens 2D (Canva), servidor/domínio, decisões de design.
- Claude **não** cria modelos 3D humanos ou armaduras com qualidade de jogo, nem acessa contas do dono.
