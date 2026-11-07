# Roadmap e decisões

## Feito
- Base idle: 8 classes em 2 facções, atributos, 10 mapas com chefes, drops por raridade, refino +10, loja, progresso offline (8 h), 3 espaços de herói.
- Cena 3D (Three.js) com modelos KayKit CC0 animados; cena 2D de reserva; áudio procedural; cidades por facção (Forja de Ferrovale, Santuário de Lumínia).
- Reforma: combate em grupo, área, atordoar, lentidão, invocações, furtividade, bloqueio, escudo de mana, reflexo, ressurreição, tipos de monstro.
- Equipamento 100% visível por tier (6 visuais por arma, elmo, armadura, luvas, botas, escudo, amuleto, anel). Conta Full de demonstração.
- **Fase 1** — mundo aberto isométrico, tocar para andar/atacar, monstros com IA, modo Auto.
- **Fase 3** — interface de MMO em tela cheia, minimapa, chat com comandos, barra de habilidades manual, atalhos, 40 missões (Comandante Varek).

## Planejado (o dono pediu para deixar os modelos de personagens e monstros para o final)
- **Fase 5 — multiplayer:** servidor (Node.js), contas, salvamento online, outros jogadores no mapa, chat real, anti-trapaça (servidor calcula XP/drops).
  Docker + docker-compose para rodar num VPS. O dono contrata o servidor e o domínio.
- **Fase 2 — corpos humanos:** um masculino e um feminino, mudando só cabelo e rosto, estilo semi-realista low-poly. O dono cria no
  **MakeHuman/MPFB** e baixa animações no **Mixamo** (só no PC); nós integramos e fazemos o retarget.
- **Fase 4 — equipamentos humanos:** modelos 3D que encaixem no corpo base; visual muda **a cada 10 níveis** (10 faixas) — exige arte (comprar ou artista).
- **Fase 6 — monstros e chefes novos** em 3D.
- Ícones de itens, retratos e logo: o dono pode gerar no **Canva** (imagens 2D, PNG sem fundo); o jogo passa a usar se existirem.

## Divisão do trabalho
- **Claude:** todo o código (regras, cena, interface, servidor, integração e otimização de modelos), testes, balanceamento, publicação.
- **Dono:** arte 3D (MakeHuman, Mixamo, compra de pacotes ou artista), imagens 2D (Canva), servidor/domínio, decisões de design.
- Claude **não** cria modelos 3D humanos ou armaduras com qualidade de jogo, nem acessa contas do dono.
