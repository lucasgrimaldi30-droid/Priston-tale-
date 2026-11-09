# Crônicas de Valdária no Roblox — Plano da Fase 1

Objetivo: uma versão pequena e jogável com amigos, reaproveitando as ideias e as contas do jogo do navegador.
O código do navegador (JS) não roda no Roblox; tudo é reescrito em **Luau** no Roblox Studio.

## Como vamos trabalhar
- PC com **Roblox Studio** + app **Claude** (pasta liberada em Configurações ➜ Claude Code ➜ Remote Control).
- Scripts escritos como arquivos nesta pasta e sincronizados com o Studio pelo plugin **Rojo** (grátis).
- O jogador entra na conta do Roblox, aprova permissões e publica. Claude escreve os scripts e ajuda a testar (Play no Studio).

## Como abrir agora (sem instalar nada)
1. Baixe `roblox/Valdaria.rbxlx` e abra com dois cliques (ou Roblox Studio > Arquivo > Abrir).
2. Aperte **Jogar** (F5). Para salvar o progresso no Studio: Arquivo > Configurações do jogo > Segurança > "Acesso do Studio aos serviços de API".
3. Para testar com mais gente no Studio: aba Testar > Clientes e servidores > 2 jogadores > Iniciar.

O arquivo é montado por `python3 roblox/ferramentas/montar.py` a partir de `roblox/src` (os dados vêm de `js/data.js` via `node roblox/ferramentas/dados.cjs`).
Com o Rojo instalado no PC, dá para trabalhar direto: `rojo serve roblox/default.project.json` e conectar o plugin.

## Já feito (versão 1 no Roblox)
- Os 10 mapas lado a lado, com cenário por tema, praça segura e letreiro; ir de um para outro pela janela Mapas.
- As 8 classes com tela de escolha (história, armas e as 6 habilidades); dados gerados de `js/data.js`.
- Monstros com nível da faixa do mapa, barra de vida, perseguição e ataque; chefe depois de 25 abates.
- Combate com as mesmas contas (acerto, crítico, defesa, esquiva, bloqueio, redução, escudo de mana, reflexo).
- Habilidades: dano, área, cura (cura aliados por perto), efeitos, invocação (aliado que bate junto), sumir, ressurreição da Clériga.
- Modo Auto (anda, ataca, usa habilidades e poções), níveis até 100, pontos automáticos, itens com raridade e afixos, troca automática pelo melhor, mochila, vender.
- Vários jogadores no mesmo servidor caçam juntos: quem bate no monstro ganha XP e o próprio drop.
- Salvar no DataStore a cada 60 s e ao sair.

## Ainda falta (próximas versões)
- Modelos 3D dos heróis e monstros (hoje: avatar do Roblox e monstros de peças), armas bonitas, efeitos das habilidades.
- Mecânicas próprias das classes (Fúria, Almas, Fé...), dois conjuntos de arma, refino, gemas, conjuntos.
- Grupo formal, masmorras, história, Alma, Capa, pets, montarias, guildas, Cerco, renascimento, progresso offline.

## Fase 1 (o que entra)
- **1 mapa:** Campos de Aurora (níveis 1–10): Coelho Saltador, Lesma Verde, Lobo Filhote e o chefe Rei Javali na arena ao norte.
- **3 classes:** Gladiador (corpo a corpo, Fúria), Arcanista (magia, elementos), Clériga (cura e Escudo Sagrado) — cobre dano, magia e cura para o grupo.
- **Combate:** clique/toque no monstro, ataque automático, 3 habilidades por classe, poções de vida e mana.
- **Modo Auto** opcional (o herói caça sozinho).
- **Níveis 1–20**, pontos de atributo, itens com raridade (comum → épico) que aparecem no personagem.
- **Grupo:** até 4 jogadores, XP dividida, bônus de papéis (dano + tanque + cura).
- **Salvar:** DataStore (nível, XP, ouro, itens). Progresso com o jogo fechado calculado ao entrar (até 8h).

## Contas que vêm do jogo atual (js/game.js)
- XP para o próximo nível: `floor(40 * nivel^2.6 + 60)`
- Monstro: vida `(30 + nivel^1.5 * 10)`, ataque `(4 + nivel * 3.2)`, defesa `nivel * 1.5`; chefe = vida ×10, ataque ×1.8.
- XP do monstro `8 + nivel^1.5 * 3` (chefe ×12); ouro `2 + nivel * 1.5` (chefe ×15).
- Dano recebido: `ataque * 150 / (150 + defesa)`.
- Chefe: marcas vermelhas no chão (golpe esmagador e ataque em área) — sair da marca evita o dano.

## Estrutura (Rojo)
```
roblox/
  default.project.json
  src/
    shared/   Dados (classes, monstros, itens, fórmulas)
    server/   Combate, monstros, drops, grupo, salvar
    client/   Interface (barras, hotbar, janelas), câmera, Auto
```

## Depois
- Fase 2: mais mapas ligados, as 8 classes, masmorras, história.
- Fase 3: Alma, Capa, pets e montarias, guildas, Cerco, renascimento e Vale da Fênix.
