// ============================================================
//  Crônicas de Valdária — dados do jogo (classes, mapas, itens)
// ============================================================

const FACTIONS = {
  ferro: { name: 'Clã de Ferrovale', desc: 'Povo das forjas e das máquinas. Confia no aço e na força bruta.', color: '#e0a050', icon: '⚒️',
    lore: 'Nas montanhas de Ferrovale o fogo das forjas nunca apaga. Quando a Marca do Vazio começou a corroer o reino, o clã não esperou por milagre: fechou os portões, afiou o aço e desceu para a guerra. Aqui o respeito se ganha com calo na mão.' },
  luz:   { name: 'Ordem de Lumínia', desc: 'Povo dos santuários. Domina a fé, o vento e as artes arcanas.', color: '#70b8ff', icon: '🕊️',
    lore: 'Lumínia nasceu ao redor dos santuários brancos do leste, onde a primeira luz do dia toca a terra. A Ordem guarda os livros, os votos e as estrelas, e acredita que o Vazio só avança onde a esperança já se apagou. Por isso carrega a luz para onde ninguém mais vai.' },
};

// História de cada classe (tela de criação)
const CLASS_LORE = {
  gladiador:  'Criado nas arenas de pedra de Ferrovale, o Gladiador aprendeu cedo que a dor é combustível. Cada golpe que leva só o deixa mais perigoso. Quando a Fúria transborda, nem os chefes do Vazio ficam de pé.',
  engenheiro: 'Enquanto outros rezam, o Engenheiro aperta parafusos. Mestre das oficinas a vapor, ele entra em batalha com torretas, um autômato fiel e uma armadura que ele mesmo forjou. Se algo pode ser consertado, pode ser melhorado.',
  cacadora:   'As Caçadoras patrulham as trilhas altas da montanha com um falcão no ombro. Paciência é a arma delas: escolhem um alvo, respiram fundo e não erram duas vezes. Dizem que enxergam a Marca do Vazio antes de ela aparecer.',
  lanceiro:   'Ninguém sabe ao certo de onde vêm os Lanceiros da Foice. Andam nas sombras das minas abandonadas e colhem as almas inquietas que o Vazio deixa para trás. O clã os teme um pouco, e precisa deles muito.',
  paladino:   'O Paladino fez um voto diante do Santuário do Alvorecer: ser o escudo de quem não tem um. Cada golpe que ele bloqueia fortalece a sua Fé, e a Fé, quando desce em forma de martelo, julga sem piedade.',
  valquiria:  'Escolhidas pelos ventos do leste, as Valquírias lutam num ritmo que só elas escutam. Dardo, escudo, passo, salto. No quarto compasso, asas de luz se abrem e o céu inteiro cai sobre o inimigo.',
  arcanista:  'Nas torres de Lumínia, o Arcanista estudou o que a maioria teme: fogo, gelo e raio numa mesma mão. Sozinhos, são perigosos. Combinados, reescrevem o campo de batalha. Ele é frágil como vidro e forte como uma tempestade.',
  cleriga:    'A Clériga caminha onde a batalha é pior, porque é lá que precisam dela. Sua luz fecha feridas, levanta os caídos e, quando sobra, vira um escudo dourado. Um grupo com uma Clériga não desiste.',
};

// Atributos: for (Força), int (Intelecto), des (Destreza), agi (Agilidade), vit (Vitalidade)
// Tipos de habilidade:
//  dmg     dano em um alvo (hits = golpes, boss = bônus contra chefes, holy = sagrado)
//  aoe     dano em todos os monstros (targets = limite de alvos), stun/slow em segundos
//  buff    bônus temporário: stat = atk, def, crit, critdmg, spd, evade, block, absorb, reflect, hpmax, undead, mshield
//  heal    cura % da vida máxima (aoe opcional com dano)
//  summon  invoca um aliado: pet = golem | falcao | fera
//  stealth fica invisível: monstros erram e o próximo golpe é crítico reforçado
//  passive bônus permanente a partir do nível (stat/val) ou revive (ressurreição automática)
const CLASSES = {
  gladiador: {
    name: 'Gladiador', faction: 'ferro', icon: '🪓', weapon: 'machado', role: 'Corpo a corpo · Caçador de chefes', mech: 'rage',
    desc: 'Força bruta com machados. A Fúria cresce com o dano que ele leva e causa, e a Execução gasta tudo num golpe que destrói chefes.',
    base: { for: 28, int: 6, des: 14, agi: 12, vit: 25 }, main: 'for', speed: 1.1,
    skills: [
      { id: 'g1', name: 'Golpe Brutal',      lvl: 1,  type: 'dmg',  mult: 1.9, cd: 4,  mp: 6 },
      { id: 'g2', name: 'Machado Veloz',     lvl: 10, type: 'buff', stat: 'spd', val: 0.45, dur: 20, cd: 32, mp: 18 },
      { id: 'g3', name: 'Furacão de Aço',    lvl: 20, type: 'aoe',  mult: 2.3, cd: 8,  mp: 24 },
      { id: 'g4', name: 'Rugido de Guerra',  lvl: 35, type: 'aoe',  mult: 0.8, stun: 2.5, cd: 18, mp: 30 },
      { id: 'g5', name: 'Queda do Titã',     lvl: 50, type: 'dmg',  mult: 6.5, boss: 0.5, cd: 13, mp: 45 },
      { id: 'g6', name: 'Execução',          lvl: 70, type: 'dmg',  mult: 9, boss: 0.6, cd: 19, mp: 70, res: { max: 100, per: 0.015, exec: 0.5 } },
    ],
  },
  engenheiro: {
    name: 'Engenheiro', faction: 'ferro', icon: '⚙️', weapon: 'martelo', anyWeapon: true, role: 'Tanque · Torretas e autômato', mech: 'cells',
    desc: 'Mestre da metalurgia. Monta torretas Tesla no chão, invoca um autômato e acumula células de energia para uma sobrecarga explosiva.',
    base: { for: 24, int: 12, des: 12, agi: 10, vit: 26 }, main: 'for', speed: 1.0,
    skills: [
      { id: 'e1', name: 'Choque Mecânico',    lvl: 1,  type: 'dmg',    mult: 1.8, cd: 4,  mp: 6, res: { gain: 1.5 } },
      { id: 'e2', name: 'Armadura Metálica',  lvl: 10, type: 'buff',   stat: 'def', val: 0.8, dur: 25, cd: 32, mp: 18 },
      { id: 'e3', name: 'Torreta Tesla',      lvl: 20, type: 'turret', mult: 0.75, dur: 15, cd: 14, mp: 24 },
      { id: 'e4', name: 'Autômato de Ferro',  lvl: 35, type: 'summon', pet: 'golem', mult: 0.6, dur: 35, cd: 45, mp: 40 },
      { id: 'e5', name: 'Esferas Giratórias', lvl: 50, type: 'buff',   stat: 'absorb', val: 0.3, dur: 22, cd: 38, mp: 40 },
      { id: 'e6', name: 'Sobrecarga Sísmica', lvl: 70, type: 'aoe',    mult: 5.5, stun: 1.5, cd: 16, mp: 70, res: { max: 5, per: 0.25, stunPer: 0.2, boom: true } },
    ],
  },
  cacadora: {
    name: 'Caçadora', faction: 'ferro', icon: '🏹', weapon: 'arco', role: 'Dano à distância · Foco no alvo', mech: 'focus',
    desc: 'Precisão máxima com o arco. Acumula Foco acertando sempre o mesmo alvo e solta um disparo que atravessa todos. Esquiva com um mortal para trás.',
    base: { for: 14, int: 8, des: 30, agi: 22, vit: 16 }, main: 'des', speed: 1.35,
    skills: [
      { id: 'c1', name: 'Flecha Certeira',    lvl: 1,  type: 'dmg',    mult: 1.7, cd: 3,  mp: 5, res: { gain: 2 } },
      { id: 'c2', name: 'Falcão Espiritual',  lvl: 10, type: 'summon', pet: 'falcao', mult: 0.6, dur: 40, cd: 48, mp: 22 },
      { id: 'c3', name: 'Chuva de Flechas',   lvl: 20, type: 'aoe',    mult: 2.2, cd: 8,  mp: 20 },
      { id: 'c4', name: 'Salto Evasivo',      lvl: 35, type: 'buff',   stat: 'evade', val: 0.25, dur: 25, cd: 34, mp: 28 },
      { id: 'c5', name: 'Mira Perfeita',      lvl: 50, type: 'buff',   stat: 'crit', val: 0.35, dur: 16, cd: 34, mp: 40 },
      { id: 'c6', name: 'Disparo Perfurante', lvl: 70, type: 'aoe',    mult: 5.5, cd: 16, mp: 72, res: { max: 5, per: 0.3, pierce: true } },
    ],
  },
  lanceiro: {
    name: 'Lanceiro', faction: 'ferro', icon: '⚔️', weapon: 'foice', critMult: 2.3, role: 'Corpo a corpo · Crítico explosivo',
    desc: 'Ceifador com foices de duas mãos. Colhe almas com o dano que causa e solta tudo nos golpes finais. Some nas sombras e tem o maior dano crítico do jogo.',
    mech: 'souls',
    base: { for: 24, int: 6, des: 22, agi: 20, vit: 18 }, main: 'for', speed: 1.2,
    skills: [
      { id: 'l1', name: 'Corte da Foice',      lvl: 1,  type: 'dmg',     mult: 1.9, cd: 4,  mp: 6, soul: { gain: 1.5 } },
      { id: 'l2', name: 'Desvanecer',          lvl: 10, type: 'stealth', dur: 3, cd: 18, mp: 15 },
      { id: 'l3', name: 'Rodopio da Foice',     lvl: 20, type: 'aoe',     mult: 2.4, cd: 9,  mp: 22, soul: { max: 2, per: 0.25 } },
      { id: 'l4', name: 'Mestre das Sombras',  lvl: 35, type: 'buff',    stat: 'critdmg', val: 0.6, dur: 20, cd: 36, mp: 30, also: { stat: 'crit', val: 0.2 } },
      { id: 'l5', name: 'Salto Ceifador',     lvl: 50, type: 'dmg',     mult: 7.2, hits: 4, cd: 13, mp: 45, soul: { max: 5, per: 0.2, hitEvery: 2 } },
      { id: 'l6', name: 'Ceifa Final',         lvl: 70, type: 'aoe',     mult: 6.5, cd: 17, mp: 72, soul: { max: 5, per: 0.3, stun5: 1.5 } },
    ],
  },
  paladino: {
    name: 'Paladino', faction: 'luz', icon: '🛡️', weapon: 'espada', role: 'Tanque sagrado · Fé que vem do escudo', mech: 'faith',
    desc: 'Espada e escudo abençoados. Cada bloqueio e cada golpe recebido viram Fé, que cai do céu como martelo e colunas de luz.',
    base: { for: 24, int: 14, des: 14, agi: 12, vit: 24 }, main: 'for', speed: 1.1,
    skills: [
      { id: 'p1', name: 'Lâmina Sagrada',       lvl: 1,  type: 'dmg',     mult: 1.8, holy: 1, cd: 4, mp: 6 },
      { id: 'p2', name: 'Bloqueio Mestre',      lvl: 10, type: 'passive', stat: 'block', val: 0.15 },
      { id: 'p3', name: 'Espada Sagrada',       lvl: 20, type: 'buff',    stat: 'undead', val: 0.8, dur: 25, cd: 34, mp: 22, also: { stat: 'atk', val: 0.15 } },
      { id: 'p4', name: 'Escudo Divino',        lvl: 35, type: 'buff',    stat: 'block', val: 0.25, dur: 20, cd: 34, mp: 30, also: { stat: 'def', val: 0.3 } },
      { id: 'p5', name: 'Martelo da Justiça',   lvl: 50, type: 'aoe',     mult: 4.5, holy: 1, cd: 12, mp: 45, res: { max: 50, per: 0.012 } },
      { id: 'p6', name: 'Julgamento Celestial', lvl: 70, type: 'aoe',     mult: 7.5, holy: 1, cd: 18, mp: 72, res: { max: 100, per: 0.012 } },
    ],
  },
  valquiria: {
    name: 'Valquíria', faction: 'luz', icon: '🗡️', weapon: 'dardo', role: 'Distância com escudo · Ritmo celeste', mech: 'combo',
    desc: 'Arremessa lanças e usa escudo. A cada 4 ataques solta uma Investida Celeste com asas de luz, e faz chover lanças douradas.',
    base: { for: 20, int: 10, des: 26, agi: 22, vit: 18 }, main: 'des', speed: 1.3,
    skills: [
      { id: 'v1', name: 'Dardo Veloz',       lvl: 1,  type: 'dmg',    mult: 1.7, cd: 3,  mp: 5 },
      { id: 'v2', name: 'Lança Solar',       lvl: 10, type: 'buff',   stat: 'atk', val: 0.3, dur: 25, cd: 34, mp: 18 },
      { id: 'v3', name: 'Arremesso Triplo',  lvl: 20, type: 'aoe',    mult: 2.4, targets: 3, cd: 8, mp: 20 },
      { id: 'v4', name: 'Vento Divino',      lvl: 35, type: 'buff',   stat: 'spd', val: 0.35, dur: 25, cd: 34, mp: 30, also: { stat: 'evade', val: 0.1 } },
      { id: 'v5', name: 'Fera Alada',        lvl: 50, type: 'summon', pet: 'fera', mult: 0.85, dur: 40, cd: 48, mp: 45 },
      { id: 'v6', name: 'Tormenta de Lanças', lvl: 70, type: 'aoe',   mult: 8, cd: 18, mp: 75 },
    ],
  },
  arcanista: {
    name: 'Arcanista', faction: 'luz', icon: '🔮', weapon: 'cajado', role: 'Dano mágico · Combina elementos', mech: 'elements',
    desc: 'Fogo, gelo e raio que se combinam: Vapor Explosivo, Prisão Elétrica e Plasma. A Nova Elemental solta tudo de uma vez.',
    base: { for: 8, int: 32, des: 14, agi: 12, vit: 16 }, main: 'int', speed: 0.95,
    skills: [
      { id: 'a1', name: 'Bola de Fogo',       lvl: 1,  type: 'dmg',  mult: 2.0, cd: 3,  mp: 7, elem: 'fogo' },
      { id: 'a2', name: 'Escudo de Energia',  lvl: 10, type: 'buff', stat: 'mshield', val: 0.6, dur: 40, cd: 44, mp: 20 },
      { id: 'a3', name: 'Onda de Gelo',       lvl: 20, type: 'aoe',  mult: 2.1, slow: 4, cd: 9, mp: 24, elem: 'gelo' },
      { id: 'a4', name: 'Raio em Cadeia',     lvl: 35, type: 'aoe',  mult: 3.4, cd: 10, mp: 34, elem: 'raio' },
      { id: 'a5', name: 'Meteoro',            lvl: 50, type: 'aoe',  mult: 6.2, cd: 14, mp: 55, elem: 'fogo' },
      { id: 'a6', name: 'Nova Elemental',     lvl: 70, type: 'aoe',  mult: 9, cd: 20, mp: 90, res: { nova: 0.3 } },
    ],
  },
  cleriga: {
    name: 'Clériga', faction: 'luz', icon: '✨', weapon: 'cetro', role: 'Cura · Escudo Sagrado · Ressurreição', mech: 'shield',
    desc: 'Curandeira suprema. A cura que passa da vida vira Escudo Sagrado, o Raio Sagrado cura quem o lança e a Onda Divina transforma o escudo em dano.',
    base: { for: 8, int: 30, des: 12, agi: 12, vit: 22 }, main: 'int', speed: 1.0,
    skills: [
      { id: 'r1', name: 'Raio Sagrado',    lvl: 1,  type: 'dmg',     mult: 1.8, holy: 1, cd: 3, mp: 6, lifesteal: 0.15 },
      { id: 'r2', name: 'Cura',            lvl: 5,  type: 'heal',    mult: 0.35, cd: 10, mp: 15 },
      { id: 'r3', name: 'Vida Virtual',    lvl: 20, type: 'buff',    stat: 'hpmax', val: 0.25, dur: 60, cd: 66, mp: 30 },
      { id: 'r4', name: 'Espelho Divino',  lvl: 35, type: 'buff',    stat: 'reflect', val: 0.3, dur: 20, cd: 38, mp: 32, also: { stat: 'absorb', val: 0.15 } },
      { id: 'r5', name: 'Ressurreição',    lvl: 50, type: 'passive', revive: 90 },
      { id: 'r6', name: 'Onda Divina',     lvl: 70, type: 'aoe',     mult: 6, holy: 1, healPct: 0.2, cd: 16, mp: 80, res: { shield: 2.2 } },
    ],
  },
};

// Tipos de monstro (bônus de classes: sagrado contra mortos-vivos etc.)
const MON_TYPES = { undead: 'Morto-vivo', beast: 'Fera', demon: 'Demônio', construct: 'Construto', spirit: 'Espírito', plant: 'Planta' };
const MON_TYPE = {
  'Coelho Saltador': 'beast', 'Lesma Verde': 'beast', 'Lobo Filhote': 'beast', 'Rei Javali': 'beast',
  'Ent Jovem': 'plant', 'Aranha da Mata': 'beast', 'Goblin Ladrão': 'demon', 'Matriarca Aracnídea': 'beast',
  'Sapo Venenoso': 'beast', 'Zumbi do Brejo': 'undead', 'Serpente Lodosa': 'beast', 'Bruxa do Pântano': 'undead',
  'Morcego Sombrio': 'beast', 'Golem de Rocha': 'construct', 'Minerador Maldito': 'undead', 'Colosso de Ferro': 'construct',
  'Escorpião Gigante': 'beast', 'Múmia Errante': 'undead', 'Verme da Areia': 'beast', 'Faraó Esquecido': 'undead',
  'Esqueleto Guerreiro': 'undead', 'Espectro': 'spirit', 'Ghoul': 'undead', 'Lich Ancião': 'undead',
  'Yeti': 'beast', 'Lobo de Gelo': 'beast', 'Elemental de Gelo': 'spirit', 'Dragão Branco': 'beast',
  'Diabrete': 'demon', 'Cão Infernal': 'demon', 'Cavaleiro Demônio': 'demon', 'Senhor das Chamas': 'demon',
  'Ciclope': 'beast', 'Gigante de Pedra': 'construct', 'Grifo': 'beast', 'Titã Primordial': 'construct',
  'Horror do Vazio': 'demon', 'Anjo Caído': 'undead', 'Devorador': 'demon', 'Deus do Abismo': 'demon',
  'Caranguejo Gigante': 'beast', 'Pirata Afogado': 'undead', 'Gaivota Feroz': 'beast', 'Capitão Abissal': 'undead',
  'Cogumelo Saltador': 'plant', 'Fada Sombria': 'spirit', 'Lagarta Gigante': 'beast', 'Rainha Micélio': 'plant',
  'Pantera Negra': 'beast', 'Planta Carnívora': 'plant', 'Xamã Tribal': 'demon', 'Serpente Ancestral': 'beast',
  'Sentinela do Vazio': 'demon', 'Colosso Partido': 'construct', 'Ceifador Astral': 'undead', 'Avatar da Fenda': 'demon', 'Vaelor, o Arauto do Vazio': 'demon',
  'Fênix Jovem': 'beast', 'Guardião de Cinzas': 'construct', 'Salamandra Solar': 'beast', 'Fênix Ancestral': 'spirit',
  'Cristal da Coroa': 'construct', 'Guardião da Coroa': 'construct', 'Arqueiro da Muralha': 'undead', 'Cavaleiro Sitiante': 'demon',
  'Harpia': 'beast', 'Golem Rúnico': 'construct', 'Guerreiro da Tempestade': 'spirit', 'Senhor do Trovão': 'spirit',
};

// Invocações
const PETS = {
  golem:  { name: 'Autômato de Ferro', icon: '🤖', taunt: true, hp: 0.9 },
  falcao: { name: 'Falcão Espiritual', icon: '🦅', spd: 0.15 },
  fera:   { name: 'Fera Alada', icon: '🐉', taunt: false },
};

// Cidades iniciais por facção
const CITIES = {
  ferro: { name: 'Forja de Ferrovale', icon: '⚒️' },
  luz:   { name: 'Santuário de Lumínia', icon: '🏛️' },
};

// Mapas — cada um com faixa de nível, monstros e um chefe
const ZONES = [
  { id: 'z1',  name: 'Campos de Aurora',       min: 1,  icon: '🌾', monsters: [['Coelho Saltador','🐇'],['Lesma Verde','🐌'],['Lobo Filhote','🐺']], boss: ['Rei Javali','🐗'] },
  { id: 'z2',  name: 'Bosque Sussurrante',     min: 6,  icon: '🌲', monsters: [['Ent Jovem','🌳'],['Aranha da Mata','🕷️'],['Goblin Ladrão','👺']], boss: ['Matriarca Aracnídea','🕸️'] },
  { id: 'z3',  name: 'Pântano Cinzento',       min: 12, icon: '🐸', monsters: [['Sapo Venenoso','🐸'],['Zumbi do Brejo','🧟'],['Serpente Lodosa','🐍']], boss: ['Bruxa do Pântano','🧙‍♀️'] },
  { id: 'z4',  name: 'Minas de Ferro Negro',   min: 20, icon: '⛏️', monsters: [['Morcego Sombrio','🦇'],['Golem de Rocha','🗿'],['Minerador Maldito','💀']], boss: ['Colosso de Ferro','🤖'] },
  { id: 'z5',  name: 'Deserto de Cobre',       min: 28, icon: '🏜️', monsters: [['Escorpião Gigante','🦂'],['Múmia Errante','🧟‍♂️'],['Verme da Areia','🪱']], boss: ['Faraó Esquecido','👑'] },
  { id: 'z6',  name: 'Catacumbas Esquecidas',  min: 37, icon: '⚰️', monsters: [['Esqueleto Guerreiro','💀'],['Espectro','👻'],['Ghoul','🧟‍♀️']], boss: ['Lich Ancião','☠️'] },
  { id: 'z7',  name: 'Picos Gélidos',          min: 46, icon: '🏔️', monsters: [['Yeti','🦍'],['Lobo de Gelo','🐺'],['Elemental de Gelo','❄️']], boss: ['Dragão Branco','🐉'] },
  { id: 'z8',  name: 'Cidadela Infernal',      min: 56, icon: '🔥', monsters: [['Diabrete','😈'],['Cão Infernal','🐕‍🦺'],['Cavaleiro Demônio','👹']], boss: ['Senhor das Chamas','🔥'] },
  { id: 'z9',  name: 'Vale dos Titãs',         min: 68, icon: '⛰️', monsters: [['Ciclope','👁️'],['Gigante de Pedra','🗿'],['Grifo','🦅']], boss: ['Titã Primordial','🌋'] },
  { id: 'z10', name: 'Abismo Eterno',          min: 82, icon: '🌌', monsters: [['Horror do Vazio','🦑'],['Anjo Caído','😇'],['Devorador','👾']], boss: ['Deus do Abismo','🌑'] },
];

// Mapas de desvio: saem de um mapa principal (saída na parte de baixo) e têm faixa de nível própria
const BRANCHES = [
  { id: 'b1', name: 'Costa dos Naufrágios', min: 9,  span: 6, parent: 'z2', icon: '🏖️', monsters: [['Caranguejo Gigante','🦀'],['Pirata Afogado','🏴‍☠️'],['Gaivota Feroz','🐦']], boss: ['Capitão Abissal','🦑'] },
  { id: 'b2', name: 'Bosque dos Cogumelos', min: 22, span: 7, parent: 'z4', icon: '🍄', monsters: [['Cogumelo Saltador','🍄'],['Fada Sombria','🧚'],['Lagarta Gigante','🐛']], boss: ['Rainha Micélio','👑'] },
  { id: 'b3', name: 'Selva Esmeralda',      min: 30, span: 8, parent: 'z5', icon: '🌴', monsters: [['Pantera Negra','🐆'],['Planta Carnívora','🌺'],['Xamã Tribal','🪶']], boss: ['Serpente Ancestral','🐍'] },
  { id: 'e1', name: 'Fenda Primordial',     min: 85, span: 15, parent: 'z10', icon: '🕳️', danger: true, monsters: [['Sentinela do Vazio','👁️'],['Colosso Partido','🗿'],['Ceifador Astral','💀']], boss: ['Avatar da Fenda','🌀'] },
  { id: 'b4', name: 'Picos Trovejantes',    min: 60, span: 9, parent: 'z8', icon: '⛈️', monsters: [['Harpia','🦅'],['Golem Rúnico','🗿'],['Guerreiro da Tempestade','⚔️']], boss: ['Senhor do Trovão','⚡'] },
];
// mapa especial do Cerco da Coroa (guerra de clãs aos domingos): os monstros acompanham o nível de quem entra
const GW_ZONE = { id: 'gw', name: 'Fortaleza da Coroa', min: 20, span: 80, tier: 8, special: true, icon: '🏰', monsters: [['Guardião da Coroa','🛡️'],['Arqueiro da Muralha','🏹'],['Cavaleiro Sitiante','⚔️']], boss: ['Cristal da Coroa','💎'] };
// mapa exclusivo de quem renasceu: monstros acompanham o nível, mais XP e ouro, Penas de Fênix
const RB_ZONE = { id: 'rb', name: 'Vale da Fênix', min: 1, span: 99, tier: 9, special: true, rebirth: true, icon: '🪶', monsters: [['Fênix Jovem','🐦‍🔥'],['Guardião de Cinzas','🗿'],['Salamandra Solar','🦎']], boss: ['Fênix Ancestral','🔥'] };
const ALL_ZONES = [...ZONES, ...BRANCHES, GW_ZONE, RB_ZONE];

const RARITIES = [
  { id: 'comum',    name: 'Comum',     color: '#c8c8c8', mult: 1.0, affixes: 0, w: 60 },
  { id: 'magico',   name: 'Mágico',    color: '#5aa0ff', mult: 1.2, affixes: 1, w: 25 },
  { id: 'raro',     name: 'Raro',      color: '#ffd84a', mult: 1.45, affixes: 2, w: 10 },
  { id: 'epico',    name: 'Épico',     color: '#c070ff', mult: 1.8, affixes: 3, w: 4 },
  { id: 'lendario', name: 'Lendário',  color: '#ff8030', mult: 2.4, affixes: 4, w: 1 },
];

const WEAPON_NAMES = {
  machado: ['Machadinha', 'Machado de Guerra', 'Machado Duplo', 'Cutelo Bárbaro', 'Machado Rúnico', 'Machado do Carrasco'],
  martelo: ['Marreta', 'Martelo de Forja', 'Malho Mecânico', 'Martelo a Vapor', 'Martelo Trovejante', 'Malho Titânico'],
  arco:    ['Arco de Caça', 'Arco Longo', 'Arco Recurvo', 'Arco Rúnico', 'Arco Asa de Dragão', 'Arco Celestial'],
  foice:   ['Foice de Camponês', 'Foice de Ferro', 'Foice Gêmea', 'Ceifadora Rúnica', 'Foice Dracônica', 'Foice do Eclipse'],
  espada:  ['Espada Curta', 'Espada Longa', 'Montante', 'Espada Bastarda', 'Lâmina Sagrada', 'Espada do Alvorecer'],
  dardo:   ['Dardo Simples', 'Azagaia', 'Dardo Farpado', 'Dardo Alado', 'Dardo Celeste', 'Dardo das Valquírias'],
  cajado:  ['Cajado de Aprendiz', 'Bastão de Carvalho', 'Cajado Rúnico', 'Cajado Estelar', 'Cajado do Arquimago', 'Cajado Primordial'],
  cetro:   ['Cetro de Madeira', 'Cetro de Prata', 'Cetro Benzido', 'Cetro Radiante', 'Cetro do Oráculo', 'Cetro Divino'],
};

const ARMOR_SLOTS = {
  armadura: { label: 'Armadura', icon: '🥋', names: ['Gibão de Couro', 'Cota de Malha', 'Armadura de Placas', 'Couraça Rúnica', 'Armadura Dracônica', 'Armadura Celestial'] },
  elmo:     { label: 'Elmo',     icon: '⛑️', names: ['Capuz', 'Elmo de Ferro', 'Elmo Cornudo', 'Elmo Rúnico', 'Coroa de Guerra', 'Elmo Celestial'] },
  escudo:   { label: 'Escudo',   icon: '🛡️', names: ['Broquel', 'Escudo Redondo', 'Escudo Torre', 'Égide Rúnica', 'Escudo Dracônico', 'Escudo Celestial'] },
  luvas:    { label: 'Luvas',    icon: '🧤', names: ['Luvas de Pano', 'Luvas de Couro', 'Manoplas', 'Manoplas Rúnicas', 'Garras Dracônicas', 'Luvas Celestiais'] },
  botas:    { label: 'Botas',    icon: '🥾', names: ['Sandálias', 'Botas de Couro', 'Grevas', 'Botas Rúnicas', 'Botas Dracônicas', 'Botas Celestiais'] },
  amuleto:  { label: 'Amuleto',  icon: '📿', names: ['Colar de Osso', 'Amuleto de Prata', 'Pingente Rúnico', 'Talismã Arcano', 'Olho do Dragão', 'Lágrima Celestial'] },
  anel:     { label: 'Anel',     icon: '💍', names: ['Anel de Cobre', 'Anel de Prata', 'Anel de Ouro', 'Anel Rúnico', 'Anel Dracônico', 'Anel Celestial'] },
};

const SLOT_ORDER = ['arma', 'escudo', 'elmo', 'armadura', 'luvas', 'botas', 'amuleto', 'anel'];

const AFFIXES = [
  { stat: 'for',  label: 'Força',       per: 0.35 },
  { stat: 'int',  label: 'Intelecto',   per: 0.35 },
  { stat: 'des',  label: 'Destreza',    per: 0.35 },
  { stat: 'agi',  label: 'Agilidade',   per: 0.35 },
  { stat: 'vit',  label: 'Vitalidade',  per: 0.35 },
  { stat: 'hp',   label: 'Vida',        per: 3.0 },
  { stat: 'mp',   label: 'Mana',        per: 1.5 },
  { stat: 'crit', label: '% Crítico',   per: 0.06, pct: true },
  { stat: 'xpb',  label: '% Experiência', per: 0.1, pct: true },
  { stat: 'gold', label: '% Ouro',      per: 0.15, pct: true },
];

const SHOP = [
  { id: 'hp1', name: 'Poção de Vida Menor',  icon: '🧪', type: 'hp', heal: 0.25, price: 15 },
  { id: 'hp2', name: 'Poção de Vida Maior',  icon: '❤️', type: 'hp', heal: 0.50, price: 80 },
  { id: 'mp1', name: 'Poção de Mana Menor',  icon: '💧', type: 'mp', heal: 0.30, price: 15 },
  { id: 'mp2', name: 'Poção de Mana Maior',  icon: '💙', type: 'mp', heal: 0.60, price: 80 },
  { id: 'pedra', name: 'Pedra de Refino',    icon: '💎', type: 'mat', price: 250 },
  { id: 'xp1',   name: 'Pergaminho de Experiência', icon: '📜', type: 'scroll', price: 6000, desc: '+50% de experiência por 30 minutos' },
  { id: 'gembag', name: 'Saco de Gemas',     icon: '💠', type: 'gembag', price: 9000, desc: 'Uma gema aleatória de nível 1' },
  { id: 'mount3', name: 'Cavalo de Guerra',  icon: '🐎', type: 'mount', mountSp: 'cavalo', price: 25000, desc: 'Montaria: +33% de velocidade e vida' },
  { id: 'mount1', name: 'Lobo de Montaria',  icon: '🐺', type: 'mount', mountSp: 'lobo', price: 60000, desc: 'Montaria: +38% de velocidade e ataque' },
  { id: 'mount2', name: 'Grifo Dourado',     icon: '🦅', type: 'mount', mountSp: 'grifo', price: 450000, desc: 'Montaria: +63% de velocidade e XP' },
  { id: 'ovo1',  name: 'Ovo Comum',          icon: '🥚', type: 'egg', egg: 'comum', price: 35000, desc: 'Nasce Gosminha, Fada Luminosa ou Raposa de Fogo' },
  { id: 'ovo2',  name: 'Ovo Raro',           icon: '🪺', type: 'egg', egg: 'raro', price: 300000, desc: 'Nasce Dragãozinho, Coruja Sábia ou Raposa de Fogo' },
];

// Gemas: encaixe nos equipamentos (1 encaixe por nível de raridade). Combine 3 iguais para subir o nível (1–5).
const GEMS = {
  rubi:      { name: 'Rubi',      icon: '🔴', color: '#ff4a4a', label: '% de ataque',  per: 2 },
  safira:    { name: 'Safira',    icon: '🔵', color: '#4a8aff', label: ' de mana',     per: 45 },
  esmeralda: { name: 'Esmeralda', icon: '🟩', color: '#4aff7a', label: '% de crítico', per: 0.8 },
  topazio:   { name: 'Topázio',   icon: '🟡', color: '#ffd24a', label: '% de esquiva', per: 0.6 },
  ametista:  { name: 'Ametista',  icon: '🟣', color: '#c070ff', label: ' de vida',     per: 60 },
};

// relógio do mundo: um dia dura 24 minutos reais; a chuva vem em janelas de 6 minutos (35% de chance, por mapa)
const DAY_MIN = 24;
function worldSky(zid) {
  const t = Date.now();
  const ph = (t / (DAY_MIN * 60000)) % 1;              // 0 = meio-dia, 0,5 = meia-noite
  const night = Math.max(0, Math.min(1, (-Math.cos(ph * Math.PI * 2) - 0.25) / 0.6)); // 0 dia … 1 noite
  const win = Math.floor(t / 360000), zi = (ALL_ZONES.findIndex((z) => z.id === zid) + 1) * 7919;
  let h = (win * 2654435761 + zi) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13;
  const dry = ['z4', 'z5', 'z7', 'z8', 'z10', 'e1', 'gw', 'rb'].includes(zid) || !/^z\d+$/.test(zid || ''); // caverna, deserto, neve, vulcão, abismo
  const rain = !dry && (h % 100) < (zid === 'b4' ? 75 : 35); // nos Picos Trovejantes quase sempre há tempestade
  return { night, rain, isNight: night > 0.5, phase: ph };
}
