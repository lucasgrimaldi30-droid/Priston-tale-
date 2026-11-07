// ============================================================
//  Crônicas de Valdária — motor do jogo idle
// ============================================================

const SAVE_PREFIX = 'valdaria_slot_';
const MAX_SLOTS = 3;
const TICK = 100; // ms
const OFFLINE_CAP = 8 * 3600; // segundos

let S = null;          // estado salvo do personagem
let slot = null;       // slot atual
let R = {};            // estado de runtime (não salvo)
let loopId = null;

// ---------- utilidades ----------
const $ = (sel) => document.querySelector(sel);
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('pt-BR');
};
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min ${s % 60}s`;
};

const xpNeed = (l) => Math.floor(40 * Math.pow(l, 2.6) * (l >= 80 ? 1 + (l - 79) * 0.08 : 1) + 60);
const MAX_LEVEL = 100;
const POINTS_PER_LEVEL = 5;

// ---------- slots / save ----------
const memSlots = {}; // usado quando o navegador bloqueia o localStorage
function loadSlot(i) {
  try { const raw = localStorage.getItem(SAVE_PREFIX + i); if (raw) return JSON.parse(raw); } catch (e) { /* armazenamento bloqueado */ }
  return memSlots[i] ? JSON.parse(JSON.stringify(memSlots[i])) : null;
}
function save() {
  if (!S) return;
  S.lastSave = Date.now();
  try { localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(S)); } catch (e) { memSlots[slot] = JSON.parse(JSON.stringify(S)); }
}
function deleteSlot(i) {
  try { localStorage.removeItem(SAVE_PREFIX + i); } catch (e) {}
  delete memSlots[i];
}

function newCharacter(name, cls) {
  const c = CLASSES[cls];
  return {
    v: 1, name, cls, lvl: 1, xp: 0, gold: 50, pts: 0,
    attr: { ...c.base }, hp: 1, mp: 1,
    equip: { arma: makeStarterWeapon(cls) },
    inv: [], pots: { hp1: 10, mp1: 10, hp2: 0, mp2: 0 }, stones: 0,
    zone: 'z1', zoneKills: {}, bosses: {},
    settings: { autoHp: 50, autoMp: 30, autoSell: 'nenhum', autoBoss: false, autoBuyPots: true, autoPts: false, gfx: '3d', sfxVol: 70, musVol: 45, muted: false, auto: true },
    stats: { kills: 0, deaths: 0, bosses: 0, goldEarned: 0, created: Date.now() },
    lastSave: Date.now(),
  };
}

function makeStarterWeapon(cls) {
  const w = CLASSES[cls].weapon;
  return { uid: uid(), slot: 'arma', wtype: w, name: WEAPON_NAMES[w][0], ilvl: 1, rarity: 'comum', min: 4, max: 7, def: 0, affixes: [], refine: 0, req: 1 };
}

// ---------- itens ----------
const SLOT_DEF = { armadura: 1.0, escudo: 0.7, elmo: 0.5, luvas: 0.3, botas: 0.35, amuleto: 0, anel: 0 };

function rollRarity(boost = 1) {
  const list = RARITIES.map((r, i) => ({ r, w: r.w * (i > 0 ? boost : 1) }));
  const total = list.reduce((a, b) => a + b.w, 0);
  let x = Math.random() * total;
  for (const e of list) { if ((x -= e.w) <= 0) return e.r; }
  return RARITIES[0];
}

function genItem(ilvl, boost = 1, forceSlot = null) {
  const rar = rollRarity(boost);
  const tier = clamp(Math.floor(ilvl / 17), 0, 5);
  let slotName = forceSlot;
  if (!slotName) slotName = Math.random() < 0.35 ? 'arma' : Object.keys(ARMOR_SLOTS)[rint(0, 6)];
  const it = { uid: uid(), slot: slotName, ilvl, rarity: rar.id, min: 0, max: 0, def: 0, affixes: [], refine: 0, req: Math.max(1, ilvl - 3) };
  if (slotName === 'arma') {
    // 70% de chance de ser do tipo da sua classe
    const types = Object.keys(WEAPON_NAMES);
    const own = CLASSES[S.cls].weapon;
    it.wtype = Math.random() < 0.7 ? own : types[rint(0, types.length - 1)];
    it.name = WEAPON_NAMES[it.wtype][tier];
    const base = (5 + ilvl * 2.2) * rar.mult * rnd(0.9, 1.1);
    it.min = Math.round(base);
    it.max = Math.round(base * rnd(1.45, 1.75));
  } else {
    it.name = ARMOR_SLOTS[slotName].names[tier];
    it.def = Math.round((3 + ilvl * 1.3) * SLOT_DEF[slotName] * rar.mult * rnd(0.9, 1.1));
  }
  let nAff = rar.affixes + ((slotName === 'amuleto' || slotName === 'anel') ? 1 : 0);
  const pool = [...AFFIXES];
  for (let i = 0; i < nAff && pool.length; i++) {
    const a = pool.splice(rint(0, pool.length - 1), 1)[0];
    let val = a.per * ilvl * rnd(0.6, 1.2) * (0.8 + RARITIES.indexOf(rar) * 0.15);
    val = a.pct ? Math.max(0.5, Math.round(val * 10) / 10) : Math.max(1, Math.round(val));
    if (a.pct) val = Math.min(val, a.stat === 'crit' ? 15 : 50);
    it.affixes.push({ stat: a.stat, val });
  }
  return it;
}

function itemValue(it) {
  const ri = RARITIES.findIndex((r) => r.id === it.rarity);
  return Math.round((4 + it.ilvl * 3) * (1 + ri * ri * 0.8) * (1 + it.refine * 0.25));
}
function refineMult(it) { return 1 + (it.refine || 0) * 0.08; }
function rarityOf(it) { return RARITIES.find((r) => r.id === it.rarity) || RARITIES[0]; }
function canUseWeapon(it) { return it.slot !== 'arma' || CLASSES[S.cls].anyWeapon || it.wtype === CLASSES[S.cls].weapon; }

function canEquip(it) { return S.lvl >= it.req && canUseWeapon(it); }

// ---------- atributos derivados ----------
function derived() {
  const c = CLASSES[S.cls];
  const bonus = { for: 0, int: 0, des: 0, agi: 0, vit: 0, hp: 0, mp: 0, crit: 0, xpb: 0, gold: 0 };
  let wmin = 1, wmax = 3, def = 0;
  for (const sl of SLOT_ORDER) {
    const it = S.equip[sl];
    if (!it) continue;
    const m = refineMult(it);
    if (sl === 'arma') {
      if (canUseWeapon(it)) { wmin = it.min * m; wmax = it.max * m; }
    } else def += it.def * m;
    for (const a of it.affixes) bonus[a.stat] += a.val;
  }
  const A = {};
  for (const k of ['for', 'int', 'des', 'agi', 'vit']) A[k] = S.attr[k] + bonus[k];
  const main = A[c.main];
  // buffs ativos + passivas aprendidas
  const B = {};
  for (const b of (R.buffs || [])) B[b.stat] = (B[b.stat] || 0) + b.val;
  for (const sk of c.skills) if (sk.type === 'passive' && sk.stat && S.lvl >= sk.lvl) B[sk.stat] = (B[sk.stat] || 0) + sk.val;
  const buff = (k) => B[k] || 0;
  if (R.pet && PETS[R.pet.kind].spd) B.spd = (B.spd || 0) + PETS[R.pet.kind].spd;
  const atkMul = 1 + buff('atk');
  const baseHp = 40 + A.vit * 8 + S.lvl * 10 + bonus.hp;
  const d = {
    A,
    maxHp: Math.round(baseHp * (1 + buff('hpmax'))),
    maxMp: Math.round(15 + A.int * 4 + S.lvl * 3 + bonus.mp),
    atkMin: Math.round((wmin + main * 0.8 + S.lvl) * atkMul),
    atkMax: Math.round((wmax + main * 1.0 + S.lvl) * atkMul),
    def: Math.round((def + A.agi * 0.6 + A.vit * 0.2) * (1 + buff('def'))),
    crit: clamp(5 + A.des * 0.08 + bonus.crit + buff('crit') * 100, 0, 75),
    critMult: (c.critMult || 1.75) + buff('critdmg'),
    aps: c.speed * (1 + A.agi / 400) * (1 + buff('spd')),
    evade: clamp(A.agi * 0.0012 + buff('evade'), 0, 0.55),
    block: clamp((S.equip.escudo ? 0.08 : 0) + buff('block'), 0, 0.6),
    absorb: clamp(buff('absorb'), 0, 0.6),
    reflect: buff('reflect'),
    mshield: clamp(buff('mshield'), 0, 0.8),
    undead: buff('undead'),
    xpb: bonus.xpb, goldb: bonus.gold,
    hpRegen: 0.01 * baseHp + A.vit * 0.1, mpRegen: 0.015 * (15 + A.int * 4 + S.lvl * 3) + A.int * 0.05,
  };
  return d;
}

// ---------- monstros ----------
function zoneById(id) { return ZONES.find((z) => z.id === id); }
function zoneSpan(z) { const i = ZONES.indexOf(z); return i < ZONES.length - 1 ? ZONES[i + 1].min - z.min : 18; }

function makeMonster(name, icon, lvl, boss, groupN) {
  const g = boss ? 1 : (groupN > 1 ? 0.55 : 1);
  const hp = Math.round((30 + Math.pow(lvl, 1.5) * 10) * (boss ? 10 : 1) * g);
  return {
    sid: uid(), name, icon, lvl, boss, hp, maxHp: hp, type: MON_TYPE[name] || 'beast',
    atk: Math.round((4 + lvl * 3.2) * (boss ? 1.8 : 1) * (groupN > 1 ? 0.5 : 1)),
    def: Math.round(lvl * 1.5 * (boss ? 1.5 : 1)),
    xp: Math.round((8 + Math.pow(lvl, 1.5) * 3) * (boss ? 12 : 1) * (groupN > 1 ? 0.6 : 1)),
    gold: Math.round((2 + lvl * 1.5) * (boss ? 15 : 1) * rnd(0.8, 1.2) * (groupN > 1 ? 0.6 : 1)),
    timer: 1.0 + Math.random() * 0.8, stun: 0, slow: 0,
  };
}
// cria um grupo de monstros (chefe vem sozinho)
// ---------- mundo aberto ----------
const WORLD = { size: 33, entry: { x: 0, z: 15 }, arena: { x: 0, z: -23 }, cap: 12 };
const RANGED_W = { arco: 1, dardo: 1, cajado: 1, cetro: 1 };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function weaponRange() { return RANGED_W[curWeapon()] ? 7 : 1.8; }
function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// acampamentos de monstros fixos por mapa (mesma semente usada pela cena 3D)
function zoneCamps(zid) {
  const r = seeded(ZONES.findIndex((z) => z.id === zid) * 977 + 13), camps = [];
  while (camps.length < 5) {
    const a = r() * Math.PI * 2, d = 9 + r() * 18, c = { x: Math.cos(a) * d, z: Math.sin(a) * d * 0.9 };
    if (dist2(c, WORLD.entry) > 9 && dist2(c, WORLD.arena) > 8 && camps.every((o) => dist2(o, c) > 8)) camps.push(c);
  }
  return camps;
}
function stepTo(o, t, max, stop = 0) {
  const dx = t.x - o.x, dz = t.z - o.z, d = Math.hypot(dx, dz);
  if (d <= stop || d < 1e-4) return true;
  const k = Math.min(max, d - stop) / d;
  o.x += dx * k; o.z += dz * k;
  return d - stop <= max;
}
function spawnWorldMonster(initial = false) {
  const z = zoneById(S.zone), span = zoneSpan(z), camps = zoneCamps(S.zone);
  for (let tries = 0; tries < 12; tries++) {
    const c = camps[rint(0, camps.length - 1)], a = Math.random() * Math.PI * 2, d = Math.random() * 3;
    const pos = { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d };
    if (R.pos && dist2(pos, R.pos) < (initial ? 6 : 9)) continue;
    const i = rint(0, 2), lvl = z.min + Math.floor((i / 3) * span) + rint(0, Math.max(1, Math.floor(span / 3)));
    const m = makeMonster(z.monsters[i][0], z.monsters[i][1], lvl, false, 2);
    Object.assign(m, { x: pos.x, z: pos.z, home: { x: c.x, z: c.z }, wp: null, wait: Math.random() * 3 });
    m.xp = Math.round(m.xp * 1.3); m.gold = Math.round(m.gold * 1.15); // compensa o tempo andando
    R.mons.push(m);
    return m;
  }
  return null;
}
function spawnBoss() {
  if (R.mons.some((m) => m.boss)) return null;
  const z = zoneById(S.zone);
  const m = makeMonster(z.boss[0], z.boss[1], z.min + zoneSpan(z) + 2, true, 1);
  Object.assign(m, { x: WORLD.arena.x, z: WORLD.arena.z, home: { ...WORLD.arena }, wp: null, wait: 2 });
  R.mons.push(m);
  log(`👑 O chefe <b>${esc(m.name)}</b> apareceu na arena ao norte!`, 'boss'); Sfx.play('boss');
  if (S.settings.auto) { R.mon = m; R.move = null; }
  return m;
}
function initWorld() {
  R.worldZone = S.zone; R.mons = []; R.mon = null; R.move = null; R.spawnT = 0; R.playerTimer = 0.3;
  R.pos = { ...WORLD.entry };
  for (let i = 0; i < WORLD.cap; i++) spawnWorldMonster(true);
}
// compatibilidade: chamado ao renascer/desafiar
function spawnMonster(boss = false) { if (boss) spawnBoss(); else if (!R.mons || !R.mons.length) initWorld(); }
function aliveMons() { return (R.mons || []).filter((m) => m.hp > 0); }
function retarget() { if (R.mon && R.mon.hp <= 0) R.mon = null; }
function nearMons(c, r) { return aliveMons().filter((m) => dist2(m, c) <= r); }
// ordens do jogador (toque/clique na cena)
window.gameOrder = (o) => {
  if (!S || !R || R.inTown || R.dead > 0) return;
  if (o.type === 'move') { R.move = { x: clamp(o.x, -WORLD.size, WORLD.size), z: clamp(o.z, -WORLD.size, WORLD.size) }; R.mon = null; }
  if (o.type === 'attack') { const m = aliveMons().find((x) => x.sid === o.sid); if (m) { R.mon = m; R.move = null; } }
};

function aliveMons() { return (R.mons || []).filter((m) => m.hp > 0); }
function retarget() { R.mon = aliveMons()[0] || null; }

// ---------- combate ----------
function log(msg, cls = '') {
  R.log.unshift({ msg, cls, t: Date.now() });
  if (R.log.length > 60) R.log.pop();
  R.dirty.log = true;
}

function floatText(target, text, cls) { Scene.float(target, text, cls); }

function curWeapon() { const c = CLASSES[S.cls]; return c.anyWeapon && S.equip.arma ? S.equip.arma.wtype : c.weapon; }

function attackSound(skillName, crit, miss) {
  const wt = curWeapon();
  const ranged = { arco: 1, dardo: 1, cajado: 1, cetro: 1 }[wt];
  const delay = ranged ? 0.5 : 0.22;
  if (wt === 'arco') Sfx.play('bow');
  else if (wt === 'dardo') Sfx.play('throw');
  else if (wt === 'cajado' || wt === 'cetro') Sfx.play('magic', { fire: /Fogo|Meteoro/.test(skillName || '') });
  else Sfx.play('slash', { gap: 30 });
  if (miss) return;
  if (skillName && (wt === 'cajado' || /Meteoro|Sísmico|Rodopio|Chuva|Tempestade|Tormenta|Nova|Julgamento|Executar/.test(skillName))) Sfx.play('boom', { delay, gap: 200 });
  else if (skillName && wt === 'cetro') Sfx.play('holy', { delay });
  Sfx.play(crit ? 'crit' : 'hit', { delay, gap: 30 });
}

// calcula e aplica o dano de um golpe em um monstro
function hitMonster(m, mult, sk, d, forceCrit) {
  let dmg = rnd(d.atkMin, d.atkMax) * mult;
  const crit = forceCrit || Math.random() * 100 < d.crit;
  if (crit) dmg *= d.critMult + (forceCrit ? 0.5 : 0);
  if (m.type === 'undead') dmg *= 1 + d.undead + (sk && sk.holy ? 0.5 : 0);
  if (m.boss && sk && sk.boss) dmg *= 1 + sk.boss;
  dmg = Math.max(1, Math.round(dmg * 100 / (100 + m.def)));
  m.hp -= dmg; m.aggro = true;
  if (sk && sk.stun) m.stun = Math.max(m.stun, sk.stun * (m.boss ? 0.4 : 1));
  if (sk && sk.slow) m.slow = Math.max(m.slow, sk.slow);
  return { dmg, crit };
}

function playerHit(mult = 1, sk = null) {
  const d = derived();
  const m = R.mon;
  if (!m) return;
  const skillName = sk ? sk.name : null;
  const stealth = R.stealth > 0;
  const hitChance = clamp(0.85 + (d.A.des - m.lvl * 2.5) * 0.003, 0.6, 0.98);
  if (!sk && !stealth && Math.random() > hitChance) { attackSound(null, false, true); Scene.playerAttack({ text: 'Errou', cls: 'miss', miss: true, hits: [{ sid: m.sid, text: 'Errou', cls: 'miss' }] }); return; }
  if (stealth) { R.stealth = 0; }
  const targets = sk && sk.type === 'aoe' ? [m, ...nearMons(m, 4.2).filter((x) => x !== m)].slice(0, sk.targets || 9) : [m];
  const hits = [];
  let total = 0, anyCrit = false;
  for (const t of targets) {
    const r = hitMonster(t, mult, sk, d, stealth && t === m);
    total += r.dmg; anyCrit = anyCrit || r.crit;
    hits.push({ sid: t.sid, text: fmt(r.dmg) + (r.crit ? '!' : ''), cls: r.crit ? 'crit' : (sk ? 'skill' : 'dmg'), stun: t.stun > 0, slow: t.slow > 0 });
  }
  attackSound(skillName, anyCrit, false);
  Scene.playerAttack({ text: hits[0].text, cls: hits[0].cls, crit: anyCrit, skill: !!sk, skillName, aoe: targets.length > 1 || (sk && sk.type === 'aoe'), hits, stealth, multi: sk && sk.hits });
  if (sk) log(`Você usou <b>${esc(skillName)}</b>${targets.length > 1 ? ` em ${targets.length} monstros` : ''} causando ${fmt(total)} de dano${sk.stun ? ' e atordoando' : ''}${sk.slow ? ' e congelando' : ''}.`, 'skill');
  if (sk && sk.healPct) { const h = Math.round(d.maxHp * sk.healPct); S.hp = Math.min(d.maxHp, S.hp + h); floatText('player', '+' + fmt(h), 'heal'); Scene.heal(); }
  for (const t of targets) if (t.hp <= 0) killMonster(t);
}

function monsterHit(m) {
  const d = derived();
  if (R.stealth > 0) { Scene.monsterAttack({ sid: m.sid, text: 'Sumiu!', cls: 'miss' }); return; }
  let dmg = Math.max(1, Math.round(m.atk * rnd(0.85, 1.15) * 150 / (150 + d.def)));
  // o autômato atrai os golpes
  if (R.pet && PETS[R.pet.kind].taunt && R.pet.hp > 0) {
    R.pet.hp -= dmg;
    Scene.monsterAttack({ sid: m.sid, text: '-' + fmt(dmg), cls: 'pet', toPet: true });
    if (R.pet.hp <= 0) { log(`💥 ${R.pet.name} foi destruído.`, 'muted'); R.pet = null; }
    return;
  }
  if (Math.random() < d.evade) { Sfx.play('whiff'); Scene.monsterAttack({ sid: m.sid, text: 'Esquiva', cls: 'miss' }); return; }
  if (Math.random() < d.block) { Sfx.play('hit', { gap: 60 }); Scene.monsterAttack({ sid: m.sid, text: 'Bloqueio', cls: 'block' }); return; }
  dmg = Math.max(1, Math.round(dmg * (1 - d.absorb)));
  if (d.mshield > 0 && S.mp > 0) { const toMp = Math.min(S.mp, Math.round(dmg * d.mshield)); S.mp -= toMp; dmg -= toMp; }
  S.hp -= dmg;
  if (d.reflect > 0) { const rf = Math.round(dmg * d.reflect); m.hp -= rf; }
  Sfx.play('hurt', { gap: 80 });
  Scene.monsterAttack({ sid: m.sid, text: '-' + fmt(dmg), cls: 'hurt' });
  if (m.hp <= 0) killMonster(m);
  if (S.hp <= 0) die(m);
}

function killMonster(m) {
  if (!m || m.dead) return;
  m.dead = true; m.hp = 0;
  const d = derived();
  const lvlDiff = S.lvl - m.lvl;
  const xpMul = lvlDiff > 8 ? Math.max(0.1, 1 - (lvlDiff - 8) * 0.1) : 1; // penalidade por matar monstro muito fraco
  const xp = Math.round(m.xp * xpMul * (1 + d.xpb / 100));
  const gold = Math.round(m.gold * (1 + d.goldb / 100));
  S.gold += gold; S.stats.goldEarned += gold; S.stats.kills++;
  S.zoneKills[S.zone] = (S.zoneKills[S.zone] || 0) + 1;
  Sfx.play('kill'); Sfx.play('coin', { gap: 150 });
  log(`${m.icon} <b>${esc(m.name)}</b> derrotado! +${fmt(xp)} XP, +${fmt(gold)} ouro.`, m.boss ? 'boss' : '');
  if (m.boss) {
    S.bosses[S.zone] = (S.bosses[S.zone] || 0) + 1; S.stats.bosses++;
    S.zoneKills[S.zone] = 0;
    for (let i = 0; i < 2; i++) dropItem(genItem(m.lvl, 4));
    S.stones += rint(1, 3);
    log(`👑 Chefe derrotado! Você recebeu Pedras de Refino.`, 'boss');
  } else {
    if (Math.random() < 0.09) dropItem(genItem(m.lvl));
    if (Math.random() < 0.012) { S.stones++; log('💎 Você encontrou uma Pedra de Refino!', 'loot'); }
  }
  gainXp(xp);
  R.mons = (R.mons || []).filter((x) => x.hp > 0);
  retarget();
  R.dirty.inv = true;
}

function dropItem(it) {
  const ri = RARITIES.findIndex((r) => r.id === it.rarity);
  const sellIdx = RARITIES.findIndex((r) => r.id === S.settings.autoSell);
  if (sellIdx >= 0 && ri <= sellIdx) {
    const v = itemValue(it);
    S.gold += v;
    log(`<span style="color:${rarityOf(it).color}">${esc(it.name)}</span> vendido automaticamente (+${fmt(v)} ouro).`, 'muted');
    return;
  }
  if (S.inv.length >= 40) {
    S.gold += itemValue(it);
    log(`Inventário cheio! ${esc(it.name)} foi vendido.`, 'muted');
    return;
  }
  S.inv.push(it);
  Sfx.play('loot', { rarity: ri, gap: 100 });
  log(`🎁 Drop: <span style="color:${rarityOf(it).color}">${esc(it.name)}</span> (${rarityOf(it).name})`, 'loot');
}

function gainXp(xp) {
  if (S.lvl >= MAX_LEVEL) return;
  S.xp += xp;
  while (S.lvl < MAX_LEVEL && S.xp >= xpNeed(S.lvl)) {
    S.xp -= xpNeed(S.lvl);
    S.lvl++;
    S.pts += POINTS_PER_LEVEL;
    const d = derived();
    S.hp = d.maxHp; S.mp = d.maxMp;
    Scene.levelUp(); Sfx.play('levelup');
    log(`⭐ <b>LEVEL UP!</b> Você alcançou o nível ${S.lvl}! (+${POINTS_PER_LEVEL} pontos de atributo)`, 'lvl');
    const sk = CLASSES[S.cls].skills.find((s) => s.lvl === S.lvl);
    if (sk) log(`📜 Nova habilidade: <b>${esc(sk.name)}</b>`, 'lvl');
    R.dirty.all = true;
  }
  if (S.settings.autoPts) autoDistribute();
  if (S.lvl >= MAX_LEVEL) S.xp = 0;
}

// distribui pontos: 3 no atributo principal da classe, 2 em vitalidade
function autoDistribute() {
  const main = CLASSES[S.cls].main;
  while (S.pts > 0) {
    const n = S.attr[main] - CLASSES[S.cls].base[main], v = S.attr.vit - CLASSES[S.cls].base.vit;
    if (n * 2 <= v * 3) S.attr[main]++; else S.attr.vit++;
    S.pts--;
  }
}

function die(killer) {
  const rev = CLASSES[S.cls].skills.find((s) => s.type === 'passive' && s.revive && S.lvl >= s.lvl);
  if (rev && !(R.reviveCd > 0)) {
    const d = derived();
    S.hp = Math.round(d.maxHp * 0.6); S.mp = Math.max(S.mp, Math.round(d.maxMp * 0.3));
    R.reviveCd = rev.revive;
    log(`🕊️ <b>${esc(rev.name)}</b>! Você voltou à vida sem perder experiência.`, 'heal');
    floatText('player', 'Ressurreição!', 'lvl'); Scene.levelUp(); Sfx.play('heal');
    return;
  }
  S.hp = 0;
  S.stats.deaths++;
  const loss = Math.floor(xpNeed(S.lvl) * 0.03);
  S.xp = Math.max(0, S.xp - loss);
  Sfx.play('death');
  log(`☠️ Você foi derrotado por ${esc(killer ? killer.name : 'monstros')}! Perdeu ${fmt(loss)} XP. Renascendo...`, 'death');
  if (killer && killer.boss) { S.zoneKills[S.zone] = 0; R.mons = R.mons.filter((m) => !m.boss); log('O chefe venceu desta vez e voltou para as sombras. Derrote mais 25 monstros para desafiá-lo de novo.', 'muted'); }
  R.dead = 5;
  for (const m of aliveMons()) { m.aggro = false; m.returning = true; }
  R.mon = null; R.move = null; R.pet = null; R.stealth = 0;
  R.buffs = [];
  R.bossFight = false;
}

function trySkills(d) {
  const c = CLASSES[S.cls];
  const avail = c.skills.filter((s) => s.type !== 'passive' && S.lvl >= s.lvl && (R.cds[s.id] || 0) <= 0 && S.mp >= s.mp && !(S.skillOff || {})[s.id]);
  const use = (s) => { S.mp -= s.mp; R.cds[s.id] = s.cd; };
  // cura
  for (const s of avail.filter((s) => s.type === 'heal')) {
    if (S.hp / d.maxHp < 0.6) {
      const h = Math.round(d.maxHp * s.mult);
      S.hp = Math.min(d.maxHp, S.hp + h); use(s);
      floatText('player', '+' + fmt(h), 'heal'); Scene.heal(); Sfx.play('heal');
      log(`💚 ${esc(s.name)} restaurou ${fmt(h)} de vida.`, 'heal');
      return null;
    }
  }
  // invocação
  for (const s of avail.filter((s) => s.type === 'summon')) {
    if (!R.pet) {
      const P = PETS[s.pet];
      R.pet = { kind: s.pet, name: P.name, icon: P.icon, t: s.dur, mult: s.mult, timer: 1, hp: Math.round(d.maxHp * (P.hp || 0)), maxHp: Math.round(d.maxHp * (P.hp || 0)), sid: uid() };
      use(s);
      log(`${P.icon} Você invocou <b>${P.name}</b>!`, 'skill'); Scene.buff(); Sfx.play('portal');
      return null;
    }
  }
  // furtividade
  for (const s of avail.filter((s) => s.type === 'stealth')) {
    if (!(R.stealth > 0) && R.mon) {
      R.stealth = s.dur; use(s);
      log(`🌑 ${esc(s.name)}: você sumiu nas sombras.`, 'skill'); Sfx.play('whiff');
      return null;
    }
  }
  // buffs
  for (const s of avail.filter((s) => s.type === 'buff')) {
    if (!R.buffs.some((b) => b.id === s.id)) {
      R.buffs.push({ id: s.id, name: s.name, stat: s.stat, val: s.val, t: s.dur });
      if (s.also) R.buffs.push({ id: s.id + '+', name: '', stat: s.also.stat, val: s.also.val, t: s.dur, hidden: true });
      use(s);
      log(`✨ ${esc(s.name)} ativado.`, 'skill'); Scene.buff(); Sfx.play('buff');
      return null;
    }
  }
  // dano: em grupo prefere área; sozinho prefere alvo único
  const n = R.mon ? nearMons(R.mon, 4.2).length : 0;
  const dmgS = avail.filter((s) => s.type === 'dmg').sort((a, b) => b.mult - a.mult);
  const aoeS = avail.filter((s) => s.type === 'aoe' && s.mult >= 1).sort((a, b) => b.mult * Math.min(n, b.targets || 9) - a.mult * Math.min(n, a.targets || 9));
  const ctrl = avail.find((s) => s.type === 'aoe' && s.mult < 1);
  if (ctrl && n >= 2) return ctrl;
  if (n >= 2 && aoeS[0]) return aoeS[0];
  return dmgS[0] || aoeS[0] || null;
}

function usePotions(d) {
  if (R.potCd > 0) return;
  const hpPct = S.hp / d.maxHp * 100, mpPct = S.mp / d.maxMp * 100;
  if (hpPct < S.settings.autoHp) {
    const id = (hpPct < 30 && S.pots.hp2 > 0) ? 'hp2' : (S.pots.hp1 > 0 ? 'hp1' : (S.pots.hp2 > 0 ? 'hp2' : null));
    if (id) {
      const p = SHOP.find((x) => x.id === id);
      const h = Math.round(d.maxHp * p.heal);
      S.hp = Math.min(d.maxHp, S.hp + h); S.pots[id]--; R.potCd = 1.5; Sfx.play('potion');
      floatText('player', '+' + fmt(h), 'heal'); Scene.heal();
      R.dirty.shop = true;
      return;
    }
  }
  if (mpPct < S.settings.autoMp) {
    const id = S.pots.mp1 > 0 ? 'mp1' : (S.pots.mp2 > 0 ? 'mp2' : null);
    if (id) {
      const p = SHOP.find((x) => x.id === id);
      S.mp = Math.min(d.maxMp, S.mp + Math.round(d.maxMp * p.heal)); S.pots[id]--; R.potCd = 1.5; Sfx.play('potion');
      R.dirty.shop = true;
    }
  }
  if (S.settings.autoBuyPots) {
    for (const id of ['hp1', 'mp1']) {
      if (S.pots[id] < 5) { const p = SHOP.find((x) => x.id === id); const n = 20; if (S.gold >= p.price * n) { S.gold -= p.price * n; S.pots[id] += n; } }
    }
  }
}

function tick() {
  const dt = TICK / 1000;
  const d = derived();
  // regeneração
  if (!R.dead) {
    S.hp = Math.min(d.maxHp, S.hp + d.hpRegen * dt);
    S.mp = Math.min(d.maxMp, S.mp + d.mpRegen * dt);
  }
  for (const k in R.cds) R.cds[k] -= dt;
  R.buffs = R.buffs.filter((b) => (b.t -= dt) > 0);
  if (R.potCd > 0) R.potCd -= dt;
  if (R.reviveCd > 0) R.reviveCd -= dt;
  if (R.stealth > 0) R.stealth -= dt;
  S.hp = Math.min(S.hp, d.maxHp);

  if (R.inTown) { // cidade: zona segura, recuperação rápida
    S.hp = Math.min(d.maxHp, S.hp + d.maxHp * 0.06 * dt);
    S.mp = Math.min(d.maxMp, S.mp + d.maxMp * 0.06 * dt);
    R.mon = null; R.dead = 0; R.bossFight = false; R.pet = null;
    return;
  }
  if (R.worldZone !== S.zone || !R.pos) initWorld();
  if (R.dead > 0) {
    R.dead -= dt;
    if (R.dead <= 0) { S.hp = d.maxHp; S.mp = d.maxMp; R.pos = { ...WORLD.entry }; log('Você renasceu na entrada do mapa.', 'muted'); }
    return;
  }
  // população do mapa
  if (R.mons.filter((m) => !m.boss).length < WORLD.cap) { R.spawnT -= dt; if (R.spawnT <= 0) { spawnWorldMonster(); R.spawnT = 3.5; } }
  if (R.bossFight || (S.settings.autoBoss && (S.zoneKills[S.zone] || 0) >= 25 && !R.mons.some((m) => m.boss))) { R.bossFight = false; spawnBoss(); }
  usePotions(d);
  if (S.hp <= 0) return;
  monstersAI(dt);
  if (R.dead > 0 || S.hp <= 0) return;
  // invocação
  if (R.pet) {
    R.pet.t -= dt; R.pet.timer -= dt;
    if (R.pet.timer <= 0 && R.mon && dist2(R.mon, R.pos) < 9) {
      R.pet.timer = R.pet.kind === 'falcao' ? 0.8 : 1.1;
      const r = hitMonster(R.mon, R.pet.mult, null, d, false);
      Scene.petAttack({ sid: R.mon.sid, text: fmt(r.dmg) + (r.crit ? '!' : ''), cls: r.crit ? 'crit' : 'pet' });
      if (R.mon.hp <= 0) killMonster(R.mon);
    }
    if (R.pet && R.pet.t <= 0) { log(`${R.pet.icon} ${R.pet.name} desapareceu.`, 'muted'); R.pet = null; }
  }
  playerAI(dt, d);
}

function playerAI(dt, d) {
  retarget();
  const speed = 4.4 * (1 + Math.min(0.5, d.aps / 4 - 0.25));
  R.moving = false;
  if (R.move) {
    if (stepTo(R.pos, R.move, speed * dt)) R.move = null;
    R.moving = true; R.face = R.move ? Math.atan2(R.move.z - R.pos.z, R.move.x - R.pos.x) : R.face;
    return;
  }
  if (!R.mon) {
    const attackers = aliveMons().filter((m) => m.aggro && !m.returning);
    const pool = attackers.length ? attackers : (S.settings.auto ? aliveMons().filter((m) => dist2(m, R.pos) < 40 && !m.boss) : []);
    let best = null, bd = 1e9;
    for (const m of pool) { const dd = dist2(m, R.pos); if (dd < bd) { bd = dd; best = m; } }
    R.mon = best;
  }
  if (!R.mon) return;
  const range = weaponRange() + (R.mon.boss ? 0.8 : 0);
  const dd = dist2(R.pos, R.mon);
  R.face = Math.atan2(R.mon.z - R.pos.z, R.mon.x - R.pos.x);
  if (dd > range) { stepTo(R.pos, R.mon, speed * dt, range * 0.85); R.moving = true; return; }
  // ataque do jogador
  R.playerTimer = (R.playerTimer || 0) - dt;
  if (R.playerTimer <= 0) {
    R.playerTimer = 1 / d.aps;
    const sk = trySkills(d);
    if (sk) { S.mp -= sk.mp; R.cds[sk.id] = sk.cd; playerHit(sk.mult, sk); }
    else playerHit(1);
  }
}

function monstersAI(dt) {
  const live = aliveMons();
  for (const m of live) {
    m.moving = false;
    if (m.stun > 0) { m.stun -= dt; continue; }
    if (m.slow > 0) m.slow -= dt;
    const sp = m.slow > 0 ? 0.5 : 1, dp = dist2(m, R.pos);
    if (!m.aggro && !m.returning && dp < (m.boss ? 9 : 5) && !(R.stealth > 0)) {
      m.aggro = true;
      for (const o of live) if (!o.aggro && !o.boss && o !== m && o.name === m.name && dist2(o, m) < 4.5) o.aggro = true; // matilha
    }
    if (m.aggro) {
      if (dist2(m, m.home) > (m.boss ? 15 : 17) || (R.stealth > 0 && dp > 3)) { m.aggro = false; m.returning = true; if (R.mon === m && !S.settings.auto) R.mon = null; continue; }
      const reach = m.boss ? 2.1 : 1.35;
      m.face = Math.atan2(R.pos.z - m.z, R.pos.x - m.x);
      if (dp > reach) { stepTo(m, R.pos, (m.boss ? 2.6 : 3.0) * sp * dt, reach * 0.9); m.moving = true; }
      else {
        m.timer -= dt * sp;
        if (m.timer <= 0) { m.timer = (m.boss ? 1.1 : 1.3) + Math.random() * 0.3; monsterHit(m); if (R.dead > 0 || S.hp <= 0) return; }
      }
    } else if (m.returning) {
      m.face = Math.atan2(m.home.z - m.z, m.home.x - m.x);
      if (stepTo(m, m.home, 4 * dt)) { m.returning = false; m.hp = m.maxHp; }
      m.moving = true;
    } else {
      // passeia perto do acampamento
      m.wait -= dt;
      if (!m.wp && m.wait <= 0) { const a = Math.random() * Math.PI * 2, r = Math.random() * 3.2; m.wp = { x: m.home.x + Math.cos(a) * r, z: m.home.z + Math.sin(a) * r }; }
      if (m.wp) { m.face = Math.atan2(m.wp.z - m.z, m.wp.x - m.x); m.moving = true; if (stepTo(m, m.wp, 1.1 * dt)) { m.wp = null; m.wait = 2 + Math.random() * 4; } }
    }
  }
  // evita monstros empilhados
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j], dx = b.x - a.x, dz = b.z - a.z, dd = Math.hypot(dx, dz), min = (a.boss || b.boss) ? 1.8 : 0.9;
    if (dd > 0.001 && dd < min) { const k = (min - dd) / dd * 0.5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
  }
}

// ---------- progresso offline ----------
function offlineProgress() {
  const elapsed = Math.min(OFFLINE_CAP, (Date.now() - (S.lastSave || Date.now())) / 1000);
  if (elapsed < 60) return null;
  R.buffs = [];
  const d = derived();
  const z = zoneById(S.zone);
  const lvl = z.min + Math.floor(zoneSpan(z) / 2);
  const mhp = 30 + Math.pow(lvl, 1.5) * 10;
  const mdef = lvl * 1.5;
  const dps = ((d.atkMin + d.atkMax) / 2) * d.aps * 100 / (100 + mdef);
  const mdps = (4 + lvl * 3.2) / 1.25 * 150 / (150 + d.def);
  // se o personagem não aguenta o mapa, rende quase nada
  const ttk = mhp / Math.max(1, dps) + 0.6;
  const survive = (d.maxHp / Math.max(1, mdps)) > ttk * 1.5;
  const eff = survive ? 0.5 : 0.05;
  const kills = Math.floor((elapsed / ttk) * eff);
  if (kills <= 0) return { elapsed, kills: 0, xp: 0, gold: 0, items: 0, lvls: 0 };
  const xpEach = (8 + Math.pow(lvl, 1.5) * 3) * (1 + d.xpb / 100) * (S.lvl - lvl > 8 ? Math.max(0.1, 1 - (S.lvl - lvl - 8) * 0.1) : 1);
  const goldEach = (2 + lvl * 1.5) * (1 + d.goldb / 100);
  const xp = Math.round(xpEach * kills), gold = Math.round(goldEach * kills);
  const startLvl = S.lvl;
  S.gold += gold; S.stats.goldEarned += gold; S.stats.kills += kills;
  S.zoneKills[S.zone] = (S.zoneKills[S.zone] || 0) + kills;
  gainXp(xp);
  const nItems = Math.min(15, Math.floor(kills * 0.12 * 0.3));
  for (let i = 0; i < nItems; i++) dropItem(genItem(lvl));
  return { elapsed, kills, xp, gold, items: nItems, lvls: S.lvl - startLvl };
}

// ============================================================
//  INTERFACE
// ============================================================

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
}

// ---------- seleção de personagem ----------
function renderSelect() {
  stopLoop();
  Scene.stop();
  showScreen('screen-select');
  let html = '';
  for (let i = 0; i < MAX_SLOTS; i++) {
    const c = loadSlot(i);
    if (c) {
      const cl = CLASSES[c.cls];
      html += `<div class="slot-card">
        <div class="slot-icon">${cl.icon}</div>
        <div class="slot-info"><b>${esc(c.name)}</b><span>${cl.name} · Nível ${c.lvl}</span><span class="muted">${FACTIONS[cl.faction].name}</span></div>
        <button class="btn primary" data-play="${i}">Jogar</button>
        <button class="btn danger small" data-del="${i}">Excluir</button>
      </div>`;
    } else {
      html += `<div class="slot-card empty"><div class="slot-icon">➕</div><div class="slot-info"><b>Espaço vazio</b><span class="muted">Crie um novo herói</span></div>
        <button class="btn primary" data-new="${i}">Criar</button></div>`;
    }
  }
  $('#slots').innerHTML = html + `<button class="btn full-acc" data-act="full-account">⭐ Conta Full de demonstração <small>Engenheiro, Lanceiro e Arcanista · nível 100 · tudo lendário +10</small></button>`;
}

let createState = { slot: 0, faction: 'ferro', cls: null };

// ---------- diálogo próprio (confirm/prompt do navegador são bloqueados em páginas incorporadas) ----------
function uiDialog({ title = '', text = '', ok = 'Confirmar', cancel = 'Cancelar', input = null, value = '', readonly = false }) {
  return new Promise((resolve) => {
    let el = document.getElementById('dialog');
    if (!el) { el = document.createElement('div'); el.id = 'dialog'; el.className = 'modal'; document.body.appendChild(el); }
    el.innerHTML = `<div class="modal-box dialog-box">
      ${title ? `<h2>${esc(title)}</h2>` : ''}<p>${esc(text)}</p>
      ${input ? `<textarea id="dlg-input" rows="4" ${readonly ? 'readonly' : ''} placeholder="${esc(input)}">${esc(value)}</textarea>` : ''}
      <div class="row-btns">${cancel ? `<button class="btn" id="dlg-no">${esc(cancel)}</button>` : ''}<button class="btn primary" id="dlg-ok">${esc(ok)}</button></div></div>`;
    el.classList.remove('hidden');
    const ta = el.querySelector('#dlg-input');
    if (ta) { ta.focus(); if (readonly) ta.select(); }
    const close = (res) => { el.classList.add('hidden'); el.innerHTML = ''; resolve(res); };
    el.querySelector('#dlg-ok').onclick = () => close({ ok: true, value: ta ? ta.value : '' });
    const no = el.querySelector('#dlg-no'); if (no) no.onclick = () => close({ ok: false, value: '' });
  });
}
const uiConfirm = async (title, text, ok = 'Confirmar') => (await uiDialog({ title, text, ok })).ok;

// ---------- conta de demonstração: 3 heróis no ápice ----------
function makeLegendary(slotName, wtype) {
  let it = null;
  for (let i = 0; i < 400; i++) { it = genItem(100, 60, slotName); if (it.rarity === 'lendario') break; }
  if (it.rarity !== 'lendario') { it.rarity = 'lendario'; }
  if (wtype) { it.wtype = wtype; it.name = WEAPON_NAMES[wtype][5]; }
  it.refine = 10; it.req = 1;
  return it;
}
function makeFullChar(name, cls, wtype) {
  const keep = S;
  S = newCharacter(name, cls);
  S.lvl = 100; S.xp = 0; S.pts = 99 * POINTS_PER_LEVEL;
  autoDistribute();
  S.equip = { arma: makeLegendary('arma', wtype) };
  for (const sl of ['armadura', 'elmo', 'luvas', 'botas', 'amuleto', 'anel']) S.equip[sl] = makeLegendary(sl);
  if (wtype !== 'foice' && wtype !== 'cajado' && wtype !== 'arco') S.equip.escudo = makeLegendary('escudo');
  S.gold = 5000000; S.stones = 250; S.pots = { hp1: 300, mp1: 300, hp2: 300, mp2: 300 };
  S.zone = 'z10';
  S.settings.autoPts = true; S.settings.autoBoss = true;
  S.zoneKills = { z10: 25 };
  const made = S; S = keep;
  return made;
}
async function createFullAccount() {
  const used = [0, 1, 2].some((i) => loadSlot(i));
  if (used && !(await uiConfirm('Conta Full', 'Isso vai substituir os heróis dos 3 espaços pela Conta Full (nível 100, tudo lendário +10). Continuar?', 'Substituir'))) return;
  const chars = [makeFullChar('Ferreus', 'engenheiro', 'martelo'), makeFullChar('Ceifador', 'lanceiro', 'foice'), makeFullChar('Arcana', 'arcanista', 'cajado')];
  let okSave = true;
  chars.forEach((c, i) => { try { localStorage.setItem(SAVE_PREFIX + i, JSON.stringify(c)); } catch (e) { okSave = false; memSlots[i] = c; } });
  if (!okSave) toast('Este navegador bloqueou o armazenamento: a conta vale só enquanto a página estiver aberta.', 'bad');
  toast('Conta Full criada: Engenheiro, Lanceiro e Arcanista no nível 100!', 'good');
  renderSelect();
}
function renderCreate() {
  showScreen('screen-create');
  const f = createState.faction;
  $('#faction-tabs').innerHTML = Object.entries(FACTIONS).map(([k, v]) =>
    `<button class="faction-btn ${k === f ? 'active' : ''}" data-faction="${k}" style="--fc:${v.color}"><b>${v.name}</b><span>${v.desc}</span></button>`).join('');
  $('#class-grid').innerHTML = Object.entries(CLASSES).filter(([, c]) => c.faction === f).map(([k, c]) => `
    <button class="class-card ${createState.cls === k ? 'active' : ''}" data-cls="${k}">
      <div class="class-icon">${c.icon}</div>
      <b>${c.name}</b>
      <span class="muted">${c.role || ''}</span>
      <span class="muted">Arma: ${c.anyWeapon ? 'qualquer (' + c.weapon + ')' : c.weapon}</span>
      <p>${c.desc}</p>
      <div class="mini-stats">${['for', 'int', 'des', 'agi', 'vit'].map((s) => `<span>${s.toUpperCase()} ${c.base[s]}</span>`).join('')}</div>
    </button>`).join('');
  $('#create-btn').disabled = !createState.cls;
}

// ---------- jogo ----------
function startGame(i) {
  slot = i;
  S = loadSlot(i);
  if (!S) return renderSelect();
  S.skillOff = S.skillOff || {};
  // migração: lança virou foice
  for (const it of [...Object.values(S.equip), ...S.inv]) if (it && it.wtype === 'lanca') { it.wtype = 'foice'; it.name = WEAPON_NAMES.foice[clamp(Math.floor(it.ilvl / 17), 0, 5)]; }
  S.settings = { autoHp: 50, autoMp: 30, autoSell: 'nenhum', autoBoss: false, autoBuyPots: true, autoPts: false, ...S.settings };
  R = { mon: null, mons: [], pos: null, move: null, worldZone: null, face: 0, pet: null, stealth: 0, reviveCd: 0, log: [], cds: {}, buffs: [], respawn: 0.5, dead: 0, potCd: 0, bossFight: false, tab: 'mapas', sel: null, dirty: { all: true } };
  const off = offlineProgress();
  const d = derived();
  S.hp = d.maxHp; S.mp = d.maxMp;
  showScreen('screen-game');
  Scene.start($('#scene'));
  log(`Bem-vindo(a) de volta, <b>${esc(S.name)}</b>!`, 'lvl');
  if (off) showOffline(off);
  renderAll();
  startLoop();
}

function startLoop() {
  stopLoop();
  R.lastTick = Date.now();
  loopId = setInterval(() => {
    // executa os ticks atrasados (abas em segundo plano são desaceleradas pelo navegador)
    const now = Date.now();
    let n = Math.min(600, Math.floor((now - R.lastTick) / TICK));
    R.lastTick += n * TICK;
    if (now - R.lastTick > 60000) R.lastTick = now;
    while (n-- > 0) tick();
    renderLive();
    if (R.dirty.all) { renderAll(); R.dirty = {}; }
    else {
      if (R.dirty.log) { renderLog(); R.dirty.log = false; }
      if (R.dirty.inv && (R.tab === 'inventario')) { renderTab(); }
      if (R.dirty.shop && R.tab === 'loja') renderTab();
      R.dirty.inv = false; R.dirty.shop = false;
    }
  }, TICK);
  R.saveId = setInterval(save, 5000);
}
function stopLoop() {
  if (loopId) clearInterval(loopId);
  if (R && R.saveId) clearInterval(R.saveId);
  loopId = null;
}

function showOffline(o) {
  $('#modal-body').innerHTML = `<h2>⏳ Progresso offline</h2>
    <p>Você ficou fora por <b>${fmtTime(o.elapsed)}</b>${o.elapsed >= OFFLINE_CAP ? ' (máximo de 8h)' : ''}.</p>
    ${o.kills ? `<ul class="offline-list">
      <li>⚔️ Monstros derrotados: <b>${fmt(o.kills)}</b></li>
      <li>✨ Experiência: <b>+${fmt(o.xp)}</b>${o.lvls ? ` (+${o.lvls} nível${o.lvls > 1 ? 'is' : ''}!)` : ''}</li>
      <li>💰 Ouro: <b>+${fmt(o.gold)}</b></li>
      <li>🎁 Itens: <b>${o.items}</b></li></ul>` : '<p class="muted">Seu personagem não conseguiu sobreviver neste mapa. Escolha um mapa mais fácil antes de sair.</p>'}
    <button class="btn primary" id="modal-close">Continuar</button>`;
  $('#modal').classList.remove('hidden');
}

function bar(cur, max, cls, label) {
  const p = clamp(cur / max * 100, 0, 100);
  return `<div class="bar ${cls}"><div class="fill" style="width:${p}%"></div><span>${label}</span></div>`;
}

function renderAll() {
  renderHeader();
  renderChar();
  renderEquip();
  renderSkillBar();
  renderLog();
  renderTab();
  renderLive();
}

function renderHeader() {
  const c = CLASSES[S.cls];
  $('#p-name').textContent = `${S.name}`;
  $('#hdr-name').innerHTML = `${c.icon} ${esc(S.name)} <span class="muted">· ${c.name} · ${FACTIONS[c.faction].name}</span>`;
}

function renderLive() {
  const d = derived();
  $('#hdr-lvl').textContent = 'Nv. ' + S.lvl;
  $('#hdr-gold').textContent = fmt(S.gold);
  $('#hdr-stones').textContent = S.stones;
  const need = xpNeed(S.lvl);
  $('#xp-bar').innerHTML = bar(S.lvl >= MAX_LEVEL ? 1 : S.xp, S.lvl >= MAX_LEVEL ? 1 : need, 'xp', S.lvl >= MAX_LEVEL ? 'NÍVEL MÁXIMO' : `XP ${fmt(S.xp)} / ${fmt(need)} (${(S.xp / need * 100).toFixed(2)}%)`);
  // jogador
  $('#p-bars').innerHTML = bar(S.hp, d.maxHp, 'hp', `${fmt(Math.max(0, S.hp))} / ${fmt(d.maxHp)}`) + bar(S.mp, d.maxMp, 'mp', `${fmt(S.mp)} / ${fmt(d.maxMp)}`);
  $('#p-buffs').innerHTML = (R.pet ? `<span class="buff pet">${R.pet.icon} ${esc(R.pet.name)} ${Math.ceil(R.pet.t)}s</span>` : '') + (R.stealth > 0 ? '<span class="buff stealth">🌑 Furtivo</span>' : '') + R.buffs.filter((b) => !b.hidden).map((b) => `<span class="buff">${esc(b.name)} ${Math.ceil(b.t)}s</span>`).join('');
  // monstro
  const m = R.mon;
  Sfx.music(R.inTown ? 'town' : (m && m.boss ? 'boss' : S.zone));
  $('#npc-bar').classList.toggle('hidden', !R.inTown);
  $('#town-btn').textContent = R.inTown ? '⚔️ Voltar a caçar' : '🏰 Cidade';
  const ab = $('#auto-btn'); ab.textContent = S.settings.auto ? '🤖 Auto: ON' : '🖐️ Auto: OFF'; ab.classList.toggle('on', !!S.settings.auto); ab.classList.toggle('hidden', !!R.inTown);
  if (R.inTown) {
    $('#mon-name').innerHTML = `${CITIES[CLASSES[S.cls].faction].icon} ${cityName()}`;
    $('#mon-bars').innerHTML = '<span class="muted small-hud">Zona segura · recuperação rápida</span>';
    $('#zone-title').innerHTML = `${CITIES[CLASSES[S.cls].faction].icon} ${cityName()} <span class="muted">(zona segura)</span>`;
    $('#boss-btn').classList.add('hidden');
  } else $('#boss-btn').classList.remove('hidden');
  if (R.inTown) {
    // nada de combate na cidade
  } else if (R.dead > 0) {
    $('#mon-name').innerHTML = `Renascendo em ${Math.ceil(R.dead)}s...`;
    $('#mon-bars').innerHTML = '';
  } else if (m) {
    const others = aliveMons().filter((x) => x.aggro && x !== m).length;
    $('#mon-name').innerHTML = `${m.boss ? '👑 ' : ''}${esc(m.name)} <span class="muted">Nv. ${m.lvl} · ${MON_TYPES[m.type]}</span>${m.stun > 0 ? ' 💫' : ''}${m.slow > 0 ? ' ❄️' : ''}${others > 0 ? ` <span class="grp">+${others}</span>` : ''}`;
    $('#mon-bars').innerHTML = bar(m.hp, m.maxHp, m.boss ? 'boss' : 'hp', `${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}`);
  } else {
    $('#mon-name').innerHTML = `<span class="muted">${S.settings.auto ? 'Procurando monstros...' : 'Toque em um monstro para atacar'}</span>`;
    $('#mon-bars').innerHTML = '';
  }
  // chefe
  const z = zoneById(S.zone);
  const k = S.zoneKills[S.zone] || 0;
  if (!R.inTown) $('#zone-title').innerHTML = `${z.icon} ${z.name} <span class="muted">(Nv. ${z.min}+)</span>`;
  $('#mute-btn').textContent = S.settings.muted ? '🔇' : '🔊';
  const bb = $('#boss-btn');
  bb.disabled = k < 25 || R.bossFight || (m && m.boss) || R.dead > 0;
  bb.textContent = k < 25 ? `👑 Chefe: ${k}/25 abates` : (m && m.boss ? '👑 Lutando contra o chefe!' : `👑 Desafiar ${z.boss[0]}`);
  // skills cooldown
  for (const s of CLASSES[S.cls].skills) {
    const el = document.getElementById('sk-' + s.id);
    if (!el) continue;
    const cd = Math.max(0, R.cds[s.id] || 0);
    el.querySelector('.cd').style.height = (cd / s.cd * 100) + '%';
    el.classList.toggle('nomp', S.mp < s.mp);
  }
  // pontos
  const pt = $('#pts-left'); if (pt) pt.textContent = S.pts;
}

function renderChar() {
  const d = derived();
  const names = { for: 'Força', int: 'Intelecto', des: 'Destreza', agi: 'Agilidade', vit: 'Vitalidade' };
  const hint = { for: 'Dano (classes de força)', int: 'Mana / dano mágico', des: 'Precisão, crítico, dano de arco/dardo', agi: 'Defesa, esquiva e velocidade', vit: 'Vida e regeneração' };
  $('#char-panel').innerHTML = `
    <h3>Atributos <span class="pts">Pontos: <b id="pts-left">${S.pts}</b>
      <button class="btn tiny ${S.settings.autoPts ? 'primary' : ''}" data-act="auto-pts" title="Distribuir automaticamente (3 no atributo principal, 2 em Vitalidade)">Auto</button></span></h3>
    ${Object.keys(names).map((k) => `<div class="attr-row" title="${hint[k]}">
      <span>${names[k]}</span><b>${d.A[k]}</b>
      <button class="btn tiny" data-attr="${k}" data-n="1" ${S.pts < 1 ? 'disabled' : ''}>+1</button>
      <button class="btn tiny" data-attr="${k}" data-n="5" ${S.pts < 5 ? 'disabled' : ''}>+5</button>
    </div>`).join('')}
    <h3>Status</h3>
    <div class="stat-grid">
      <span>Ataque</span><b>${fmt(d.atkMin)} - ${fmt(d.atkMax)}</b>
      <span>Defesa</span><b>${fmt(d.def)}</b>
      <span>Crítico</span><b>${d.crit.toFixed(1)}%</b>
      <span>Vel. Ataque</span><b>${d.aps.toFixed(2)}/s</b>
      <span>Esquiva</span><b>${(d.evade * 100).toFixed(1)}%</b>
      <span>Bônus XP</span><b>+${d.xpb.toFixed(1)}%</b>
      <span>Bônus Ouro</span><b>+${d.goldb.toFixed(1)}%</b>
      <span>Abates</span><b>${fmt(S.stats.kills)}</b>
      <span>Chefes</span><b>${fmt(S.stats.bosses)}</b>
      <span>Mortes</span><b>${fmt(S.stats.deaths)}</b>
    </div>`;
}

function itemIcon(it) {
  if (it.slot === 'arma') return CLASSES[Object.keys(CLASSES).find((k) => CLASSES[k].weapon === it.wtype)].icon;
  return ARMOR_SLOTS[it.slot].icon;
}
function itemTitle(it) { return `${esc(it.name)}${it.refine ? ' +' + it.refine : ''}`; }

function itemDetail(it, compare = true) {
  const r = rarityOf(it);
  const m = refineMult(it);
  const aff = AFFIXES.reduce((o, a) => (o[a.stat] = a, o), {});
  let h = `<div class="item-detail" style="--rc:${r.color}">
    <div class="it-name">${itemIcon(it)} ${itemTitle(it)}</div>
    <div class="muted">${r.name} · ${it.slot === 'arma' ? 'Arma (' + it.wtype + ')' : ARMOR_SLOTS[it.slot].label} · Nível do item ${it.ilvl}</div>`;
  if (it.slot === 'arma') h += `<div>Dano: <b>${Math.round(it.min * m)} - ${Math.round(it.max * m)}</b></div>`;
  else if (it.def) h += `<div>Defesa: <b>${Math.round(it.def * m)}</b></div>`;
  for (const a of it.affixes) h += `<div class="affix">+${a.val}${aff[a.stat].pct ? '' : ''} ${aff[a.stat].label}</div>`;
  h += `<div class="${S.lvl >= it.req ? 'muted' : 'bad'}">Requer nível ${it.req}</div>`;
  if (!canUseWeapon(it)) h += `<div class="bad">Sua classe não usa ${it.wtype}</div>`;
  if (compare) {
    const cur = S.equip[it.slot];
    if (cur && cur.uid !== it.uid) {
      if (it.slot === 'arma') {
        const diff = Math.round((it.min + it.max) / 2 * m - (cur.min + cur.max) / 2 * refineMult(cur));
        h += `<div class="${diff >= 0 ? 'good' : 'bad'}">${diff >= 0 ? '▲' : '▼'} ${diff} dano médio vs. equipado</div>`;
      } else if (it.def || cur.def) {
        const diff = Math.round(it.def * m - cur.def * refineMult(cur));
        h += `<div class="${diff >= 0 ? 'good' : 'bad'}">${diff >= 0 ? '▲' : '▼'} ${diff} defesa vs. equipado</div>`;
      }
    }
  }
  h += `<div class="muted">Valor: ${fmt(itemValue(it))} ouro</div></div>`;
  return h;
}

function renderEquip() {
  $('#equip-panel').innerHTML = `<h3>Equipamento</h3><div class="equip-grid">${SLOT_ORDER.map((sl) => {
    const it = S.equip[sl];
    const label = sl === 'arma' ? 'Arma' : ARMOR_SLOTS[sl].label;
    if (!it) return `<div class="eq-slot empty" title="${label}"><span class="eq-ico">${sl === 'arma' ? '⚔️' : ARMOR_SLOTS[sl].icon}</span><small>${label}</small></div>`;
    return `<div class="eq-slot" data-eq="${sl}" style="--rc:${rarityOf(it).color}" title="${esc(it.name)}"><span class="eq-ico">${itemIcon(it)}</span><small>${itemTitle(it)}</small></div>`;
  }).join('')}</div>`;
}

function renderSkillBar() {
  $('#skill-bar').innerHTML = CLASSES[S.cls].skills.map((s) => {
    const locked = S.lvl < s.lvl;
    const off = S.skillOff[s.id];
    return `<div class="skill ${locked ? 'locked' : ''} ${off ? 'off' : ''}" id="sk-${s.id}" data-skill="${s.id}" title="${esc(s.name)} — ${skillDesc(s)}${locked ? ' (Nv. ' + s.lvl + ')' : ''}">
      <div class="cd"></div><span>${esc(s.name)}</span>${locked ? `<em>Nv.${s.lvl}</em>` : ''}</div>`;
  }).join('');
}

function skillDesc(s) {
  const lbl = { atk: 'ataque', def: 'defesa', crit: 'chance de crítico', critdmg: 'dano crítico', spd: 'velocidade', evade: 'esquiva', block: 'bloqueio', absorb: 'redução de dano', reflect: 'reflexo de dano', hpmax: 'vida máxima', undead: 'dano contra mortos-vivos', mshield: 'dano convertido em mana' };
  const cost = s.cd ? ` Recarga ${s.cd}s, ${s.mp} MP.` : '';
  const extra = s.also ? ` e +${Math.round(s.also.val * 100)}% de ${lbl[s.also.stat]}` : '';
  switch (s.type) {
    case 'dmg': return `Causa ${Math.round(s.mult * 100)}% de dano${s.hits ? ` em ${s.hits} golpes` : ''}${s.holy ? ' sagrado (+50% em mortos-vivos)' : ''}${s.boss ? ` (+${Math.round(s.boss * 100)}% em chefes)` : ''}.` + cost;
    case 'aoe': return `${s.mult < 1 ? 'Atinge' : `Causa ${Math.round(s.mult * 100)}% de dano em`} ${s.targets ? `até ${s.targets} monstros` : 'todos os monstros'}${s.holy ? ' (sagrado)' : ''}${s.stun ? `, atordoando por ${s.stun}s` : ''}${s.slow ? `, deixando lentos por ${s.slow}s` : ''}${s.healPct ? ` e cura ${Math.round(s.healPct * 100)}% da vida` : ''}.` + cost;
    case 'heal': return `Cura ${Math.round(s.mult * 100)}% da vida máxima.` + cost;
    case 'summon': return `Invoca ${PETS[s.pet].icon} ${PETS[s.pet].name} por ${s.dur}s${PETS[s.pet].taunt ? ', que atrai os ataques dos monstros' : ''}${PETS[s.pet].spd ? ' e aumenta sua velocidade' : ''}.` + cost;
    case 'stealth': return `Fica invisível por ${s.dur}s: os monstros erram e o próximo golpe é um crítico reforçado.` + cost;
    case 'passive': return s.revive ? `Passiva: ao morrer, volta com 60% da vida sem perder XP (a cada ${s.revive}s).` : `Passiva: +${Math.round(s.val * 100)}% de ${lbl[s.stat]} permanente.`;
    default: return `+${Math.round(s.val * 100)}% de ${lbl[s.stat]}${extra} por ${s.dur}s.` + cost;
  }
}

function renderLog() {
  $('#log').innerHTML = R.log.slice(0, 40).map((l) => `<div class="log-line lg-${l.cls}">${l.msg}</div>`).join('');
}

const NPCS = {
  mercador: { name: 'Bruna, a Mercadora', icon: '🛒', tab: 'loja', line: 'Poções fresquinhas e Pedras de Refino! Ninguém sobrevive lá fora sem estoque.' },
  ferreiro: { name: 'Torvak, o Ferreiro', icon: '🔨', tab: 'refino', line: 'Traga suas armas e armaduras. Com pedras e ouro, deixo tudo mais forte... quase sempre.' },
  portal:   { name: 'Elyon, Mestre dos Portais', icon: '🌀', tab: 'mapas', line: 'Para onde deseja viajar, aventureiro? Meus portais levam a todos os cantos de Valdária.' },
  mestra:   { name: 'Sábia Mirela', icon: '📜', tab: 'habilidades', line: 'Domine suas técnicas. Se quiser recomeçar seu treino, posso redistribuir seus pontos.' },
  bau:      { name: 'Baú do Aventureiro', icon: '🧰', tab: 'inventario', line: 'Seus equipamentos e espólios guardados com segurança.' },
};

function openNpc(id) {
  if (!S || !NPCS[id]) return;
  R.npc = id;
  Sfx.play('open');
  renderNpc();
  $('#modal').classList.remove('hidden');
}
window.openNpc = openNpc;

function renderNpc() {
  if (!R.npc) return;
  const n = NPCS[R.npc];
  const fn = { mapas: tabMaps, inventario: tabInv, habilidades: tabSkills, loja: tabShop, refino: tabRefine }[n.tab];
  $('#modal-body').innerHTML = `<div class="npc-head"><span class="npc-ico">${n.icon}</span><div><b>${n.name}</b><p>“${n.line}”</p></div></div>
    ${R.npc === 'mestra' ? `<button class="btn small" data-act="reset-pts">Redistribuir pontos (${fmt(resetCost())} ouro)</button>` : ''}
    <div class="npc-body">${fn()}</div>
    <button class="btn" id="modal-close">Fechar</button>`;
  $('#modal-body').classList.add('wide');
}

function cityName() { return CITIES[CLASSES[S.cls].faction].name; }

function setTown(on) {
  if (!!R.inTown === on) return;
  R.inTown = on;
  Sfx.play('portal');
  if (on) { R.mon = null; R.move = null; R.buffs = []; R.pet = null; log(`🏰 Você chegou à <b>${cityName()}</b>. Fale com os moradores!`, 'lvl'); }
  else { R.worldZone = null; log(`⚔️ Você partiu para ${zoneById(S.zone).name}.`, 'muted'); }
  R.dirty.all = true;
}

function renderTab() {
  for (const b of document.querySelectorAll('.tab-btn')) b.classList.toggle('active', b.dataset.tab === R.tab);
  const el = $('#tab-content');
  const fn = { mapas: tabMaps, inventario: tabInv, habilidades: tabSkills, loja: tabShop, refino: tabRefine, config: tabConfig }[R.tab];
  el.innerHTML = fn();
  if (R.npc) renderNpc();
}

function tabMaps() {
  return `<div class="zone-list">${ZONES.map((z) => {
    const locked = S.lvl < z.min - 3;
    const cur = z.id === S.zone;
    return `<button class="zone ${cur ? 'active' : ''}" data-zone="${z.id}" ${locked ? 'disabled' : ''}>
      <span class="zone-ico">${z.icon}</span>
      <span class="zone-info"><b>${z.name}</b><small>Nível ${z.min} – ${z.min + zoneSpan(z)} · Chefe: ${z.boss[1]} ${z.boss[0]}</small>
      <small class="muted">${z.monsters.map((m) => m[1] + ' ' + m[0]).join(' · ')}</small>
      <small class="muted">Chefes derrotados: ${S.bosses[z.id] || 0}</small></span>
      ${locked ? `<span class="lock">🔒 Nv.${z.min - 3}</span>` : ''}
    </button>`;
  }).join('')}</div>`;
}

function tabInv() {
  const sel = S.inv.find((i) => i.uid === R.sel) || (R.selEq && S.equip[R.selEq]);
  let html = `<div class="inv-head"><span>Mochila ${S.inv.length}/40</span>
    <span><button class="btn small" data-act="sort">Ordenar</button>
    <button class="btn small" data-act="sell-common">Vender comuns</button>
    <button class="btn small" data-act="sell-magic">Vender ≤ mágicos</button></span></div>
    <div class="inv-grid">`;
  for (const it of S.inv) {
    const better = isUpgrade(it);
    html += `<div class="inv-item ${it.uid === R.sel ? 'sel' : ''} ${canEquip(it) ? '' : 'unusable'}" data-item="${it.uid}" style="--rc:${rarityOf(it).color}" title="${esc(it.name)}">
      ${itemIcon(it)}${it.refine ? `<i>+${it.refine}</i>` : ''}${better ? '<b class="up">▲</b>' : ''}</div>`;
  }
  for (let i = S.inv.length; i < 40; i++) html += `<div class="inv-item empty"></div>`;
  html += `</div>`;
  if (sel) {
    const isEq = R.selEq && S.equip[R.selEq] && S.equip[R.selEq].uid === sel.uid;
    html += itemDetail(sel, !isEq) + `<div class="item-actions">` +
      (isEq ? `<button class="btn" data-act="unequip">Desequipar</button>`
            : `<button class="btn primary" data-act="equip" ${canEquip(sel) ? '' : 'disabled'}>Equipar</button>
               <button class="btn danger" data-act="sell">Vender (${fmt(itemValue(sel))})</button>`) +
      `<button class="btn" data-act="to-refine">Refinar</button></div>`;
  } else html += `<p class="muted center">Clique em um item para ver detalhes. ▲ indica melhoria.</p>`;
  return html;
}

function isUpgrade(it) {
  if (!canEquip(it)) return false;
  const cur = S.equip[it.slot];
  if (!cur) return true;
  if (it.slot === 'arma') return (it.min + it.max) * refineMult(it) > (cur.min + cur.max) * refineMult(cur);
  if (it.slot === 'amuleto' || it.slot === 'anel') return RARITIES.findIndex((r) => r.id === it.rarity) > RARITIES.findIndex((r) => r.id === cur.rarity) || (it.rarity === cur.rarity && it.ilvl > cur.ilvl);
  return it.def * refineMult(it) > cur.def * refineMult(cur);
}

function tabSkills() {
  const c = CLASSES[S.cls];
  return `<p class="muted">As habilidades são usadas automaticamente em combate. Clique para ligar/desligar.</p>
  <div class="skill-list">${c.skills.map((s) => {
    const locked = S.lvl < s.lvl;
    const on = !S.skillOff[s.id];
    return `<div class="skill-row ${locked ? 'locked' : ''}">
      <div><b>${esc(s.name)}</b> <span class="tag ${s.type}">${{ dmg: 'Ataque', aoe: 'Área', buff: 'Bônus', heal: 'Cura', summon: 'Invocação', stealth: 'Furtividade', passive: 'Passiva' }[s.type]}</span><br><small class="muted">${skillDesc(s)}</small></div>
      ${locked ? `<span class="lock">🔒 Nv.${s.lvl}</span>` : s.type === 'passive' ? '<span class="tag passive">Sempre ativa</span>' : `<button class="btn small ${on ? 'primary' : ''}" data-toggle-skill="${s.id}">${on ? 'Ligada' : 'Desligada'}</button>`}
    </div>`;
  }).join('')}</div>`;
}

function tabShop() {
  return `<p class="muted">Loja da cidade. Poções são usadas automaticamente conforme suas configurações.</p>
  <div class="shop-list">${SHOP.map((p) => {
    const have = p.type === 'mat' ? S.stones : S.pots[p.id];
    return `<div class="shop-row"><span class="shop-ico">${p.icon}</span>
      <div><b>${p.name}</b><br><small class="muted">${p.type === 'mat' ? 'Usada para refinar equipamentos' : `Restaura ${p.heal * 100}% de ${p.type === 'hp' ? 'vida' : 'mana'}`} · Você tem: <b>${have}</b></small></div>
      <span class="price">💰 ${fmt(p.price)}</span>
      <span class="buy">${[1, 10, 50].map((n) => `<button class="btn small" data-buy="${p.id}" data-n="${n}" ${S.gold < p.price * n ? 'disabled' : ''}>x${n}</button>`).join('')}</span></div>`;
  }).join('')}</div>`;
}

function refineInfo(it) {
  const lv = it.refine || 0;
  return {
    chance: Math.max(10, 100 - lv * 9),
    stones: 1 + Math.floor(lv / 3),
    gold: Math.round(50 * (lv + 1) * (1 + it.ilvl / 5)),
    risk: lv >= 5,
  };
}

function tabRefine() {
  const all = [...SLOT_ORDER.map((s) => S.equip[s]).filter(Boolean), ...S.inv];
  const sel = all.find((i) => i.uid === R.refSel);
  let html = `<p class="muted">Refine seus itens até <b>+10</b>. Cada nível aumenta 8% do dano/defesa base. A partir de +5, falhar faz o item perder um nível. Você tem <b>${S.stones}</b> 💎.</p>
  <div class="inv-grid">${all.map((it) => `<div class="inv-item ${it.uid === R.refSel ? 'sel' : ''}" data-ref="${it.uid}" style="--rc:${rarityOf(it).color}" title="${esc(it.name)}">${itemIcon(it)}${it.refine ? `<i>+${it.refine}</i>` : ''}${Object.values(S.equip).some((e) => e && e.uid === it.uid) ? '<b class="eqd">E</b>' : ''}</div>`).join('')}</div>`;
  if (sel) {
    const r = refineInfo(sel);
    html += itemDetail(sel, false);
    if (sel.refine >= 10) html += `<p class="good center">Item no refino máximo!</p>`;
    else html += `<div class="refine-box">
      <div>+${sel.refine} → <b>+${sel.refine + 1}</b></div>
      <div>Chance de sucesso: <b>${r.chance}%</b></div>
      <div>Custo: <b>${r.stones}</b> 💎 + <b>${fmt(r.gold)}</b> ouro</div>
      ${r.risk ? '<div class="bad">⚠ Falhar reduz o refino em 1</div>' : ''}
      <button class="btn primary" data-act="refine" ${S.stones < r.stones || S.gold < r.gold ? 'disabled' : ''}>Refinar</button></div>`;
  } else html += `<p class="muted center">Escolha um item para refinar.</p>`;
  return html;
}

function tabConfig() {
  const st = S.settings;
  return `<div class="config">
    <label>Usar poção de vida abaixo de <b>${st.autoHp}%</b><input type="range" min="0" max="90" step="5" value="${st.autoHp}" data-set="autoHp"></label>
    <label>Usar poção de mana abaixo de <b>${st.autoMp}%</b><input type="range" min="0" max="90" step="5" value="${st.autoMp}" data-set="autoMp"></label>
    <label>Vender automaticamente drops até:
      <select data-set="autoSell">
        <option value="nenhum" ${st.autoSell === 'nenhum' ? 'selected' : ''}>Não vender</option>
        ${RARITIES.slice(0, 3).map((r) => `<option value="${r.id}" ${st.autoSell === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
      </select></label>
    <label>Volume dos efeitos <b>${st.sfxVol ?? 70}%</b><input type="range" min="0" max="100" step="5" value="${st.sfxVol ?? 70}" data-set="sfxVol"></label>
    <label>Volume da música <b>${st.musVol ?? 45}%</b><input type="range" min="0" max="100" step="5" value="${st.musVol ?? 45}" data-set="musVol"></label>
    <label>Gráficos da batalha:
      <select data-set="gfx">
        <option value="3d" ${st.gfx !== '2d' ? 'selected' : ''}>3D (Three.js)</option>
        <option value="2d" ${st.gfx === '2d' ? 'selected' : ''}>2D (mais leve)</option>
      </select></label>
    <label class="check"><input type="checkbox" data-set="autoBoss" ${st.autoBoss ? 'checked' : ''}> Desafiar chefe automaticamente (a cada 25 abates)</label>
    <label class="check"><input type="checkbox" data-set="autoBuyPots" ${st.autoBuyPots ? 'checked' : ''}> Comprar poções menores automaticamente quando acabarem</label>
    <hr>
    <div class="row-btns">
      <button class="btn" data-act="export">Exportar save</button>
      <button class="btn" data-act="import">Importar save</button>
      <button class="btn" data-act="reset-pts">Redistribuir pontos (${fmt(resetCost())} ouro)</button>
    </div>
    <p class="muted">O jogo salva automaticamente a cada 5 segundos. Fora do jogo, seu herói continua caçando por até 8 horas.</p>
  </div>`;
}

function resetCost() { return S.lvl * 200; }

// ---------- ações ----------
function equipItem(id) {
  const idx = S.inv.findIndex((i) => i.uid === id);
  if (idx < 0) return;
  const it = S.inv[idx];
  if (!canEquip(it)) return;
  const old = S.equip[it.slot];
  S.inv.splice(idx, 1);
  if (old) S.inv.push(old);
  S.equip[it.slot] = it;
  R.sel = null;
  clampVitals();
  R.dirty.all = true;
}
function unequip(sl) {
  const it = S.equip[sl];
  if (!it) return;
  if (S.inv.length >= 40) { log('Mochila cheia!', 'muted'); return; }
  delete S.equip[sl];
  S.inv.push(it);
  R.selEq = null; R.sel = it.uid;
  clampVitals();
  R.dirty.all = true;
}
function clampVitals() { const d = derived(); S.hp = Math.min(S.hp, d.maxHp); S.mp = Math.min(S.mp, d.maxMp); }
function sellItem(id) {
  const idx = S.inv.findIndex((i) => i.uid === id);
  if (idx < 0) return;
  const v = itemValue(S.inv[idx]);
  S.gold += v; Sfx.play('coin');
  S.inv.splice(idx, 1);
  R.sel = null;
}
function sellUpTo(maxIdx) {
  let total = 0;
  S.inv = S.inv.filter((it) => {
    const ri = RARITIES.findIndex((r) => r.id === it.rarity);
    if (ri <= maxIdx && !it.refine) { total += itemValue(it); return false; }
    return true;
  });
  S.gold += total; if (total) Sfx.play('coin');
  log(`Itens vendidos por ${fmt(total)} ouro.`, 'muted');
  R.sel = null;
}
function doRefine() {
  const all = [...Object.values(S.equip).filter(Boolean), ...S.inv];
  const it = all.find((i) => i.uid === R.refSel);
  if (!it || it.refine >= 10) return;
  const r = refineInfo(it);
  if (S.stones < r.stones || S.gold < r.gold) return;
  S.stones -= r.stones; S.gold -= r.gold;
  if (Math.random() * 100 < r.chance) {
    it.refine++;
    log(`🔨 Refino bem-sucedido! ${esc(it.name)} agora é <b>+${it.refine}</b>.`, 'lvl');
    toast(`Sucesso! ${it.name} +${it.refine}`, 'good'); Sfx.play('refineOk');
  } else {
    if (r.risk) it.refine--;
    log(`💔 O refino falhou${r.risk ? ` e ${esc(it.name)} caiu para +${it.refine}` : ''}.`, 'death');
    toast('O refino falhou...', 'bad'); Sfx.play('refineFail');
  }
  R.dirty.all = true;
}

function toast(msg, cls = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + cls;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ---------- eventos ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-play],[data-del],[data-new],[data-faction],[data-cls],[data-attr],[data-zone],[data-tab],[data-item],[data-eq],[data-act],[data-buy],[data-ref],[data-toggle-skill],[data-skill],[data-npc],#create-btn,#create-back,#boss-btn,#town-btn,#auto-btn,#mute-btn,#modal-close,#btn-exit');
  if (!t) return;
  const ds = t.dataset;
  if (ds.play !== undefined) return startGame(+ds.play);
  if (ds.del !== undefined) {
    uiConfirm('Excluir herói', 'Excluir este personagem permanentemente?', 'Excluir').then((y) => { if (y) { deleteSlot(+ds.del); renderSelect(); } });
    return;
  }
  if (ds.new !== undefined) { createState = { slot: +ds.new, faction: 'ferro', cls: null }; $('#char-name').value = ''; return renderCreate(); }
  if (ds.faction) { createState.faction = ds.faction; createState.cls = null; return renderCreate(); }
  if (ds.cls) { createState.cls = ds.cls; return renderCreate(); }
  if (t.id === 'create-back') return renderSelect();
  if (t.id === 'create-btn') {
    const name = $('#char-name').value.trim().slice(0, 16);
    if (!name) { toast('Digite um nome para o herói.', 'bad'); return; }
    if (!createState.cls) return;
    slot = createState.slot;
    S = newCharacter(name, createState.cls);
    save();
    return startGame(slot);
  }
  if (t.id === 'btn-exit') { save(); return renderSelect(); }
  if (t.id === 'modal-close') { $('#modal').classList.add('hidden'); $('#modal-body').classList.remove('wide'); if (R) R.npc = null; return; }
  if (ds.act === 'full-account') return createFullAccount();
  if (!S) return;
  if (ds.attr) {
    const n = Math.min(+ds.n, S.pts);
    if (n > 0) { S.attr[ds.attr] += n; S.pts -= n; renderChar(); }
    return;
  }
  if (t.id === 'town-btn') { setTown(!R.inTown); return; }
  if (t.id === 'auto-btn') { S.settings.auto = !S.settings.auto; Sfx.play('click'); if (!S.settings.auto) { R.mon = null; } toast(S.settings.auto ? 'Modo automático ligado: o herói caça sozinho.' : 'Modo manual: toque no chão para andar e nos monstros para atacar.'); renderLive(); return; }
  if (t.id === 'mute-btn') { S.settings.muted = !S.settings.muted; Sfx.init(); Sfx.applyVolume(); renderLive(); return; }
  if (ds.npc) { if (R.inTown) { if (Scene.walkToNpc && Scene.walkToNpc(ds.npc)) return; openNpc(ds.npc); } return; }
  if (t.id === 'boss-btn') { if ((S.zoneKills[S.zone] || 0) >= 25) { R.bossFight = true; log('Você desafiou o chefe do mapa!', 'boss'); } return; }
  if (ds.zone) {
    const changed = ds.zone !== S.zone;
    if (changed) { S.zone = ds.zone; R.worldZone = null; R.mon = null; R.respawn = 0.5; R.bossFight = false; log(`Você viajou para ${zoneById(ds.zone).name}.`, 'muted'); }
    if (R.inTown) setTown(false); else if (changed) Sfx.play('portal');
    if (R.npc) { R.npc = null; $('#modal').classList.add('hidden'); $('#modal-body').classList.remove('wide'); }
    return renderTab();
  }
  if (ds.tab) { R.tab = ds.tab; Sfx.play('click'); return renderTab(); }
  if (ds.item) { R.sel = ds.item; R.selEq = null; return renderTab(); }
  if (ds.eq) { R.selEq = ds.eq; R.sel = null; R.tab = 'inventario'; return renderTab(); }
  if (ds.ref) { R.refSel = ds.ref; return renderTab(); }
  if (ds.toggleSkill) { S.skillOff[ds.toggleSkill] = !S.skillOff[ds.toggleSkill]; renderSkillBar(); return renderTab(); }
  if (ds.skill) { if (S.lvl >= CLASSES[S.cls].skills.find((s) => s.id === ds.skill).lvl) { S.skillOff[ds.skill] = !S.skillOff[ds.skill]; renderSkillBar(); if (R.tab === 'habilidades') renderTab(); } return; }
  if (ds.buy) {
    const p = SHOP.find((x) => x.id === ds.buy), n = +ds.n;
    if (S.gold >= p.price * n) { Sfx.play('coin'); S.gold -= p.price * n; if (p.type === 'mat') S.stones += n; else S.pots[p.id] += n; }
    return renderTab();
  }
  switch (ds.act) {
    case 'equip': equipItem(R.sel); break;
    case 'unequip': unequip(R.selEq); break;
    case 'sell': sellItem(R.sel); renderTab(); break;
    case 'sell-common': sellUpTo(0); renderTab(); break;
    case 'sell-magic': sellUpTo(1); renderTab(); break;
    case 'sort':
      S.inv.sort((a, b) => RARITIES.findIndex((r) => r.id === b.rarity) - RARITIES.findIndex((r) => r.id === a.rarity) || a.slot.localeCompare(b.slot) || b.ilvl - a.ilvl);
      renderTab(); break;
    case 'to-refine': R.refSel = R.sel || (R.selEq && S.equip[R.selEq].uid); R.tab = 'refino'; renderTab(); break;
    case 'refine': doRefine(); break;
    case 'auto-pts': S.settings.autoPts = !S.settings.autoPts; if (S.settings.autoPts) autoDistribute(); renderChar(); break;
    case 'reset-pts': {
      const cost = resetCost();
      if (S.gold < cost) { toast('Ouro insuficiente.', 'bad'); break; }
      uiConfirm('Redistribuir pontos', `Redistribuir todos os pontos por ${fmt(cost)} ouro?`).then((y) => {
        if (!y || S.gold < cost) return;
        S.gold -= cost;
        S.attr = { ...CLASSES[S.cls].base };
        S.pts = (S.lvl - 1) * POINTS_PER_LEVEL;
        clampVitals();
        R.dirty.all = true;
      });
      break;
    }
    case 'export': {
      save();
      const code = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
      uiDialog({ title: 'Exportar save', text: 'Copie o código abaixo e guarde em um lugar seguro.', input: 'código', value: code, readonly: true, ok: 'Copiar', cancel: 'Fechar' }).then((r) => {
        if (r.ok) navigator.clipboard?.writeText(code).then(() => toast('Save copiado!', 'good'), () => toast('Selecione e copie o código manualmente.', 'bad'));
      });
      break;
    }
    case 'import': {
      uiDialog({ title: 'Importar save', text: 'Cole o código do save:', input: 'cole aqui', ok: 'Importar' }).then((r) => {
        if (!r.ok || !r.value.trim()) return;
        try {
          const obj = JSON.parse(decodeURIComponent(escape(atob(r.value.trim()))));
          if (!obj.cls || !CLASSES[obj.cls]) throw new Error('inválido');
          S = obj; save(); startGame(slot); toast('Save importado!', 'good');
        } catch (err) { toast('Código de save inválido.', 'bad'); }
      });
      break;
    }
  }
});

document.addEventListener('input', (e) => {
  const k = e.target.dataset.set;
  if (!k || !S) return;
  const v = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'range' ? +e.target.value : e.target.value);
  S.settings[k] = v;
  if (k === 'gfx') Scene.start();
  if (k === 'sfxVol' || k === 'musVol') Sfx.applyVolume();
  if (e.target.type === 'range') e.target.previousElementSibling.textContent = v + '%';
});

window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

renderSelect();
