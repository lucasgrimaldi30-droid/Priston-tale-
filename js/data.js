// ============================================================
//  Crônicas de Valdária — dados do jogo (classes, mapas, itens)
// ============================================================

const FACTIONS = {
  ferro: { name: 'Clã de Ferrovale', desc: 'Povo das forjas e das máquinas. Confia no aço e na força bruta.', color: '#e0a050' },
  luz:   { name: 'Ordem de Lumínia', desc: 'Povo dos santuários. Domina a fé, o vento e as artes arcanas.', color: '#70b8ff' },
};

// Atributos: for (Força), int (Intelecto), des (Destreza), agi (Agilidade), vit (Vitalidade)
const CLASSES = {
  gladiador: {
    name: 'Gladiador', faction: 'ferro', icon: '🪓', weapon: 'machado',
    desc: 'Guerreiro brutal de machado. Muito dano corpo a corpo e muita vida.',
    base: { for: 28, int: 6, des: 14, agi: 12, vit: 25 }, main: 'for', speed: 1.1,
    skills: [
      { id: 'g1', name: 'Golpe Duplo',     lvl: 1,  type: 'dmg',  mult: 1.8, cd: 4,  mp: 6 },
      { id: 'g2', name: 'Fúria Sangrenta', lvl: 10, type: 'buff', stat: 'atk', val: 0.30, dur: 15, cd: 30, mp: 20 },
      { id: 'g3', name: 'Rodopio de Aço',  lvl: 20, type: 'dmg',  mult: 3.2, cd: 8,  mp: 22 },
      { id: 'g4', name: 'Pele de Pedra',   lvl: 35, type: 'buff', stat: 'def', val: 0.50, dur: 20, cd: 40, mp: 30 },
      { id: 'g5', name: 'Executar',        lvl: 50, type: 'dmg',  mult: 6.0, cd: 14, mp: 45 },
      { id: 'g6', name: 'Grito do Titã',   lvl: 70, type: 'buff', stat: 'atk', val: 0.70, dur: 20, cd: 60, mp: 70 },
    ],
  },
  engenheiro: {
    name: 'Engenheiro', faction: 'ferro', icon: '⚙️', weapon: 'martelo',
    desc: 'Combatente blindado com martelo mecânico. Defesa altíssima e golpes elétricos.',
    base: { for: 24, int: 12, des: 12, agi: 10, vit: 26 }, main: 'for', speed: 1.0,
    skills: [
      { id: 'e1', name: 'Choque Mecânico',  lvl: 1,  type: 'dmg',  mult: 1.7, cd: 4,  mp: 6 },
      { id: 'e2', name: 'Blindagem Extra',  lvl: 10, type: 'buff', stat: 'def', val: 0.60, dur: 20, cd: 30, mp: 18 },
      { id: 'e3', name: 'Martelo Trovão',   lvl: 20, type: 'dmg',  mult: 3.0, cd: 8,  mp: 22 },
      { id: 'e4', name: 'Reparo de Campo',  lvl: 35, type: 'heal', mult: 0.30, cd: 25, mp: 35 },
      { id: 'e5', name: 'Sobrecarga',       lvl: 50, type: 'buff', stat: 'atk', val: 0.50, dur: 18, cd: 45, mp: 45 },
      { id: 'e6', name: 'Impacto Sísmico',  lvl: 70, type: 'dmg',  mult: 7.0, cd: 15, mp: 70 },
    ],
  },
  cacadora: {
    name: 'Caçadora', faction: 'ferro', icon: '🏹', weapon: 'arco',
    desc: 'Arqueira veloz e certeira. Ataques rápidos e muitos críticos.',
    base: { for: 14, int: 8, des: 30, agi: 22, vit: 16 }, main: 'des', speed: 1.35,
    skills: [
      { id: 'c1', name: 'Flecha Perfurante', lvl: 1,  type: 'dmg',  mult: 1.6, cd: 3,  mp: 5 },
      { id: 'c2', name: 'Olho de Falcão',    lvl: 10, type: 'buff', stat: 'crit', val: 0.20, dur: 20, cd: 35, mp: 18 },
      { id: 'c3', name: 'Chuva de Flechas',  lvl: 20, type: 'dmg',  mult: 3.0, cd: 7,  mp: 20 },
      { id: 'c4', name: 'Passo do Vento',    lvl: 35, type: 'buff', stat: 'spd', val: 0.40, dur: 20, cd: 40, mp: 30 },
      { id: 'c5', name: 'Flecha Fênix',      lvl: 50, type: 'dmg',  mult: 5.5, cd: 12, mp: 42 },
      { id: 'c6', name: 'Tempestade Alada',  lvl: 70, type: 'dmg',  mult: 9.0, cd: 18, mp: 75 },
    ],
  },
  lanceiro: {
    name: 'Lanceiro', faction: 'ferro', icon: '🔱', weapon: 'lanca',
    desc: 'Mestre da lança de longo alcance. Equilíbrio entre dano e agilidade.',
    base: { for: 24, int: 6, des: 20, agi: 20, vit: 20 }, main: 'for', speed: 1.2,
    skills: [
      { id: 'l1', name: 'Estocada',         lvl: 1,  type: 'dmg',  mult: 1.8, cd: 4,  mp: 6 },
      { id: 'l2', name: 'Postura Firme',    lvl: 10, type: 'buff', stat: 'def', val: 0.40, dur: 20, cd: 30, mp: 16 },
      { id: 'l3', name: 'Lança Giratória',  lvl: 20, type: 'dmg',  mult: 3.1, cd: 8,  mp: 22 },
      { id: 'l4', name: 'Sede de Combate',  lvl: 35, type: 'buff', stat: 'atk', val: 0.40, dur: 18, cd: 40, mp: 30 },
      { id: 'l5', name: 'Investida Mortal', lvl: 50, type: 'dmg',  mult: 6.0, cd: 13, mp: 45 },
      { id: 'l6', name: 'Lança do Dragão',  lvl: 70, type: 'dmg',  mult: 8.5, cd: 17, mp: 72 },
    ],
  },
  paladino: {
    name: 'Paladino', faction: 'luz', icon: '🛡️', weapon: 'espada',
    desc: 'Cavaleiro sagrado de espada. Resistente, com bênçãos e cura.',
    base: { for: 24, int: 14, des: 14, agi: 12, vit: 24 }, main: 'for', speed: 1.1,
    skills: [
      { id: 'p1', name: 'Lâmina Sagrada',   lvl: 1,  type: 'dmg',  mult: 1.7, cd: 4,  mp: 6 },
      { id: 'p2', name: 'Bênção Divina',    lvl: 10, type: 'buff', stat: 'def', val: 0.45, dur: 20, cd: 30, mp: 18 },
      { id: 'p3', name: 'Cruz Radiante',    lvl: 20, type: 'dmg',  mult: 3.0, cd: 8,  mp: 22 },
      { id: 'p4', name: 'Luz Restauradora', lvl: 35, type: 'heal', mult: 0.35, cd: 25, mp: 35 },
      { id: 'p5', name: 'Julgamento',       lvl: 50, type: 'dmg',  mult: 6.0, cd: 13, mp: 45 },
      { id: 'p6', name: 'Aura do Paladino', lvl: 70, type: 'buff', stat: 'atk', val: 0.60, dur: 20, cd: 55, mp: 70 },
    ],
  },
  valquiria: {
    name: 'Valquíria', faction: 'luz', icon: '🗡️', weapon: 'dardo',
    desc: 'Guerreira de dardos arremessados. Ágil, crítica e mortal à distância.',
    base: { for: 20, int: 10, des: 26, agi: 22, vit: 16 }, main: 'des', speed: 1.3,
    skills: [
      { id: 'v1', name: 'Dardo Veloz',       lvl: 1,  type: 'dmg',  mult: 1.6, cd: 3,  mp: 5 },
      { id: 'v2', name: 'Foco de Batalha',   lvl: 10, type: 'buff', stat: 'crit', val: 0.18, dur: 20, cd: 35, mp: 18 },
      { id: 'v3', name: 'Dardo Triplo',      lvl: 20, type: 'dmg',  mult: 3.0, cd: 7,  mp: 20 },
      { id: 'v4', name: 'Graça da Deusa',    lvl: 35, type: 'heal', mult: 0.25, cd: 25, mp: 30 },
      { id: 'v5', name: 'Lança Celeste',     lvl: 50, type: 'dmg',  mult: 5.5, cd: 12, mp: 42 },
      { id: 'v6', name: 'Tormenta de Dardos',lvl: 70, type: 'dmg',  mult: 9.0, cd: 18, mp: 75 },
    ],
  },
  arcanista: {
    name: 'Arcanista', faction: 'luz', icon: '🔮', weapon: 'cajado',
    desc: 'Mago elemental. Pouca vida, mas magias devastadoras.',
    base: { for: 8, int: 32, des: 14, agi: 12, vit: 16 }, main: 'int', speed: 0.9,
    skills: [
      { id: 'a1', name: 'Bola de Fogo',      lvl: 1,  type: 'dmg',  mult: 2.0, cd: 3,  mp: 7 },
      { id: 'a2', name: 'Escudo Arcano',     lvl: 10, type: 'buff', stat: 'def', val: 0.60, dur: 20, cd: 30, mp: 20 },
      { id: 'a3', name: 'Lança de Gelo',     lvl: 20, type: 'dmg',  mult: 3.6, cd: 7,  mp: 24 },
      { id: 'a4', name: 'Mente Ampliada',    lvl: 35, type: 'buff', stat: 'atk', val: 0.45, dur: 20, cd: 40, mp: 35 },
      { id: 'a5', name: 'Meteoro',           lvl: 50, type: 'dmg',  mult: 7.0, cd: 13, mp: 55 },
      { id: 'a6', name: 'Nova Elemental',    lvl: 70, type: 'dmg',  mult: 11.0, cd: 18, mp: 90 },
    ],
  },
  cleriga: {
    name: 'Clériga', faction: 'luz', icon: '✨', weapon: 'cetro',
    desc: 'Curandeira de cetro. Sobrevive a tudo e pune mortos-vivos com luz.',
    base: { for: 8, int: 30, des: 12, agi: 12, vit: 20 }, main: 'int', speed: 1.0,
    skills: [
      { id: 'r1', name: 'Raio Sagrado',      lvl: 1,  type: 'dmg',  mult: 1.8, cd: 3,  mp: 6 },
      { id: 'r2', name: 'Cura',              lvl: 5,  type: 'heal', mult: 0.30, cd: 12, mp: 15 },
      { id: 'r3', name: 'Escudo da Fé',      lvl: 20, type: 'buff', stat: 'def', val: 0.70, dur: 20, cd: 35, mp: 25 },
      { id: 'r4', name: 'Esfera de Luz',     lvl: 35, type: 'dmg',  mult: 4.0, cd: 9,  mp: 32 },
      { id: 'r5', name: 'Renascer',          lvl: 50, type: 'heal', mult: 0.60, cd: 30, mp: 55 },
      { id: 'r6', name: 'Ira Celestial',     lvl: 70, type: 'dmg',  mult: 9.5, cd: 17, mp: 85 },
    ],
  },
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
  arco:    ['Arco Curto', 'Arco Longo', 'Arco Composto', 'Arco Élfico', 'Arco Tempestade', 'Arco do Firmamento'],
  lanca:   ['Lança de Madeira', 'Pique', 'Alabarda', 'Lança Serpente', 'Glaive Rúnica', 'Lança Dracônica'],
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
];
