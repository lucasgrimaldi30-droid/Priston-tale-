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
function loadSlot(i) {
  try { const raw = localStorage.getItem(SAVE_PREFIX + i); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function save() {
  if (!S) return;
  S.lastSave = Date.now();
  try { localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(S)); } catch (e) { /* armazenamento indisponível */ }
}
function deleteSlot(i) {
  try { localStorage.removeItem(SAVE_PREFIX + i); } catch (e) {}
}

function newCharacter(name, cls) {
  const c = CLASSES[cls];
  return {
    v: 1, name, cls, lvl: 1, xp: 0, gold: 50, pts: 0,
    attr: { ...c.base }, hp: 1, mp: 1,
    equip: { arma: makeStarterWeapon(cls) },
    inv: [], pots: { hp1: 10, mp1: 10, hp2: 0, mp2: 0 }, stones: 0,
    zone: 'z1', zoneKills: {}, bosses: {},
    settings: { autoHp: 50, autoMp: 30, autoSell: 'nenhum', autoBoss: false, autoBuyPots: true, autoPts: false },
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
function canUseWeapon(it) { return it.slot !== 'arma' || it.wtype === CLASSES[S.cls].weapon; }
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
  const buff = (stat) => (R.buffs || []).filter((b) => b.stat === stat).reduce((a, b) => a + b.val, 0);
  const atkMul = 1 + buff('atk');
  const d = {
    A,
    maxHp: Math.round(40 + A.vit * 8 + S.lvl * 10 + bonus.hp),
    maxMp: Math.round(15 + A.int * 4 + S.lvl * 3 + bonus.mp),
    atkMin: Math.round((wmin + main * 0.8 + S.lvl) * atkMul),
    atkMax: Math.round((wmax + main * 1.0 + S.lvl) * atkMul),
    def: Math.round((def + A.agi * 0.6 + A.vit * 0.2) * (1 + buff('def'))),
    crit: clamp(5 + A.des * 0.08 + bonus.crit + buff('crit') * 100, 0, 60),
    aps: c.speed * (1 + A.agi / 400) * (1 + buff('spd')),
    evade: clamp(A.agi * 0.0012, 0, 0.3),
    xpb: bonus.xpb, goldb: bonus.gold,
    hpRegen: 0.01 * (40 + A.vit * 8 + S.lvl * 10) + A.vit * 0.1, mpRegen: 0.015 * (15 + A.int * 4 + S.lvl * 3) + A.int * 0.05,
  };
  return d;
}

// ---------- monstros ----------
function zoneById(id) { return ZONES.find((z) => z.id === id); }
function zoneSpan(z) { const i = ZONES.indexOf(z); return i < ZONES.length - 1 ? ZONES[i + 1].min - z.min : 18; }

function spawnMonster(boss = false) {
  const z = zoneById(S.zone);
  const span = zoneSpan(z);
  let lvl, name, icon;
  if (boss) {
    lvl = z.min + span + 2; [name, icon] = z.boss;
  } else {
    const i = rint(0, 2);
    lvl = z.min + Math.floor((i / 3) * span) + rint(0, Math.max(1, Math.floor(span / 3)));
    [name, icon] = z.monsters[i];
  }
  const hp = Math.round((30 + Math.pow(lvl, 1.5) * 10) * (boss ? 10 : 1));
  R.mon = {
    name, icon, lvl, boss, hp, maxHp: hp,
    atk: Math.round((4 + lvl * 3.2) * (boss ? 1.8 : 1)),
    def: Math.round(lvl * 1.5 * (boss ? 1.5 : 1)),
    xp: Math.round((8 + Math.pow(lvl, 1.5) * 3) * (boss ? 12 : 1)),
    gold: Math.round((2 + lvl * 1.5) * (boss ? 15 : 1) * rnd(0.8, 1.2)),
    timer: 1.2,
  };
  R.playerTimer = 0.3;
}

// ---------- combate ----------
function log(msg, cls = '') {
  R.log.unshift({ msg, cls, t: Date.now() });
  if (R.log.length > 60) R.log.pop();
  R.dirty.log = true;
}

function floatText(target, text, cls) {
  if (document.hidden) return;
  const el = document.getElementById(target === 'mon' ? 'mon-card' : 'player-card');
  if (!el) return;
  const f = document.createElement('div');
  f.className = 'float ' + cls;
  f.textContent = text;
  f.style.left = rint(30, 70) + '%';
  el.appendChild(f);
  setTimeout(() => f.remove(), 900);
}

function playerHit(mult = 1, skillName = null) {
  const d = derived();
  const m = R.mon;
  const hitChance = clamp(0.85 + (d.A.des - m.lvl * 2.5) * 0.003, 0.6, 0.98);
  if (!skillName && Math.random() > hitChance) { floatText('mon', 'Errou', 'miss'); return; }
  let dmg = rnd(d.atkMin, d.atkMax) * mult;
  const crit = Math.random() * 100 < d.crit;
  if (crit) dmg *= 1.75;
  dmg = Math.max(1, Math.round(dmg * 100 / (100 + m.def)));
  m.hp -= dmg;
  floatText('mon', (crit ? '💥 ' : '') + fmt(dmg), crit ? 'crit' : (skillName ? 'skill' : 'dmg'));
  if (skillName) log(`Você usou <b>${esc(skillName)}</b> causando ${fmt(dmg)} de dano.`, 'skill');
  if (m.hp <= 0) killMonster();
}

function monsterHit() {
  const d = derived();
  const m = R.mon;
  if (Math.random() < d.evade) { floatText('player', 'Esquiva', 'miss'); return; }
  let dmg = m.atk * rnd(0.85, 1.15) * 150 / (150 + d.def);
  dmg = Math.max(1, Math.round(dmg));
  S.hp -= dmg;
  floatText('player', '-' + fmt(dmg), 'hurt');
  if (S.hp <= 0) die();
}

function killMonster() {
  const m = R.mon, d = derived();
  const lvlDiff = S.lvl - m.lvl;
  const xpMul = lvlDiff > 8 ? Math.max(0.1, 1 - (lvlDiff - 8) * 0.1) : 1; // penalidade por matar monstro muito fraco
  const xp = Math.round(m.xp * xpMul * (1 + d.xpb / 100));
  const gold = Math.round(m.gold * (1 + d.goldb / 100));
  S.gold += gold; S.stats.goldEarned += gold; S.stats.kills++;
  S.zoneKills[S.zone] = (S.zoneKills[S.zone] || 0) + 1;
  log(`${m.icon} <b>${esc(m.name)}</b> derrotado! +${fmt(xp)} XP, +${fmt(gold)} ouro.`, m.boss ? 'boss' : '');
  if (m.boss) {
    S.bosses[S.zone] = (S.bosses[S.zone] || 0) + 1; S.stats.bosses++;
    S.zoneKills[S.zone] = 0;
    for (let i = 0; i < 2; i++) dropItem(genItem(m.lvl, 4));
    S.stones += rint(1, 3);
    log(`👑 Chefe derrotado! Você recebeu Pedras de Refino.`, 'boss');
  } else {
    if (Math.random() < 0.12) dropItem(genItem(m.lvl));
    if (Math.random() < 0.015) { S.stones++; log('💎 Você encontrou uma Pedra de Refino!', 'loot'); }
  }
  gainXp(xp);
  R.mon = null;
  R.respawn = 0.6;
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

function die() {
  S.hp = 0;
  S.stats.deaths++;
  const loss = Math.floor(xpNeed(S.lvl) * 0.03);
  S.xp = Math.max(0, S.xp - loss);
  log(`☠️ Você foi derrotado por ${esc(R.mon.name)}! Perdeu ${fmt(loss)} XP. Renascendo...`, 'death');
  if (R.mon.boss) { S.zoneKills[S.zone] = 0; log('O chefe venceu desta vez. Derrote mais 25 monstros para desafiá-lo de novo.', 'muted'); }
  R.dead = 5;
  R.mon = null;
  R.buffs = [];
  R.bossFight = false;
}

function trySkills(d) {
  const c = CLASSES[S.cls];
  const avail = c.skills.filter((s) => S.lvl >= s.lvl && (R.cds[s.id] || 0) <= 0 && S.mp >= s.mp && !(S.skillOff || {})[s.id]);
  // cura
  for (const s of avail.filter((s) => s.type === 'heal')) {
    if (S.hp / d.maxHp < 0.6) {
      const h = Math.round(d.maxHp * s.mult);
      S.hp = Math.min(d.maxHp, S.hp + h); S.mp -= s.mp; R.cds[s.id] = s.cd;
      floatText('player', '+' + fmt(h), 'heal');
      log(`💚 ${esc(s.name)} restaurou ${fmt(h)} de vida.`, 'heal');
      return null;
    }
  }
  // buffs
  for (const s of avail.filter((s) => s.type === 'buff')) {
    if (!R.buffs.some((b) => b.id === s.id)) {
      R.buffs.push({ id: s.id, name: s.name, stat: s.stat, val: s.val, t: s.dur });
      S.mp -= s.mp; R.cds[s.id] = s.cd;
      log(`✨ ${esc(s.name)} ativado.`, 'skill');
      return null;
    }
  }
  // dano — o mais forte disponível
  const dmg = avail.filter((s) => s.type === 'dmg').sort((a, b) => b.mult - a.mult)[0];
  return dmg || null;
}

function usePotions(d) {
  if (R.potCd > 0) return;
  const hpPct = S.hp / d.maxHp * 100, mpPct = S.mp / d.maxMp * 100;
  if (hpPct < S.settings.autoHp) {
    const id = (hpPct < 30 && S.pots.hp2 > 0) ? 'hp2' : (S.pots.hp1 > 0 ? 'hp1' : (S.pots.hp2 > 0 ? 'hp2' : null));
    if (id) {
      const p = SHOP.find((x) => x.id === id);
      const h = Math.round(d.maxHp * p.heal);
      S.hp = Math.min(d.maxHp, S.hp + h); S.pots[id]--; R.potCd = 1.5;
      floatText('player', '+' + fmt(h), 'heal');
      R.dirty.shop = true;
      return;
    }
  }
  if (mpPct < S.settings.autoMp) {
    const id = S.pots.mp1 > 0 ? 'mp1' : (S.pots.mp2 > 0 ? 'mp2' : null);
    if (id) {
      const p = SHOP.find((x) => x.id === id);
      S.mp = Math.min(d.maxMp, S.mp + Math.round(d.maxMp * p.heal)); S.pots[id]--; R.potCd = 1.5;
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

  if (R.dead > 0) {
    R.dead -= dt;
    if (R.dead <= 0) { S.hp = d.maxHp; S.mp = d.maxMp; log('Você renasceu na cidade e voltou ao campo de caça.', 'muted'); spawnMonster(); }
    return;
  }
  if (!R.mon) {
    R.respawn -= dt;
    if (R.respawn <= 0) {
      const boss = R.bossFight || (S.settings.autoBoss && (S.zoneKills[S.zone] || 0) >= 25);
      R.bossFight = false;
      spawnMonster(boss);
      if (boss) log(`👑 O chefe <b>${esc(R.mon.name)}</b> apareceu!`, 'boss');
    }
    return;
  }
  usePotions(d);
  if (S.hp <= 0) return;
  // ataque do jogador
  R.playerTimer -= dt;
  if (R.playerTimer <= 0) {
    R.playerTimer = 1 / d.aps;
    const sk = trySkills(d);
    if (sk) { S.mp -= sk.mp; R.cds[sk.id] = sk.cd; playerHit(sk.mult, sk.name); }
    else playerHit(1);
  }
  if (!R.mon) return;
  // ataque do monstro
  R.mon.timer -= dt;
  if (R.mon.timer <= 0) {
    R.mon.timer = R.mon.boss ? 1.1 : 1.25;
    monsterHit();
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
  $('#slots').innerHTML = html;
}

let createState = { slot: 0, faction: 'ferro', cls: null };
function renderCreate() {
  showScreen('screen-create');
  const f = createState.faction;
  $('#faction-tabs').innerHTML = Object.entries(FACTIONS).map(([k, v]) =>
    `<button class="faction-btn ${k === f ? 'active' : ''}" data-faction="${k}" style="--fc:${v.color}"><b>${v.name}</b><span>${v.desc}</span></button>`).join('');
  $('#class-grid').innerHTML = Object.entries(CLASSES).filter(([, c]) => c.faction === f).map(([k, c]) => `
    <button class="class-card ${createState.cls === k ? 'active' : ''}" data-cls="${k}">
      <div class="class-icon">${c.icon}</div>
      <b>${c.name}</b>
      <span class="muted">Arma: ${c.weapon}</span>
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
  S.settings = { autoHp: 50, autoMp: 30, autoSell: 'nenhum', autoBoss: false, autoBuyPots: true, autoPts: false, ...S.settings };
  R = { mon: null, log: [], cds: {}, buffs: [], respawn: 0.5, dead: 0, potCd: 0, bossFight: false, tab: 'mapas', sel: null, dirty: { all: true } };
  const off = offlineProgress();
  const d = derived();
  S.hp = d.maxHp; S.mp = d.maxMp;
  showScreen('screen-game');
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
  $('#p-icon').textContent = c.icon;
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
  $('#p-buffs').innerHTML = R.buffs.map((b) => `<span class="buff">${esc(b.name)} ${Math.ceil(b.t)}s</span>`).join('');
  // monstro
  const m = R.mon;
  if (R.dead > 0) {
    $('#mon-icon').textContent = '🪦';
    $('#mon-name').innerHTML = `Renascendo em ${Math.ceil(R.dead)}s...`;
    $('#mon-bars').innerHTML = '';
  } else if (m) {
    $('#mon-icon').textContent = m.icon;
    $('#mon-name').innerHTML = `${m.boss ? '👑 ' : ''}${esc(m.name)} <span class="muted">Nv. ${m.lvl}</span>`;
    $('#mon-bars').innerHTML = bar(m.hp, m.maxHp, m.boss ? 'boss' : 'hp', `${fmt(Math.max(0, m.hp))} / ${fmt(m.maxHp)}`);
    $('#mon-card').classList.toggle('is-boss', m.boss);
  } else {
    $('#mon-icon').textContent = '…';
    $('#mon-name').innerHTML = '<span class="muted">Procurando monstros...</span>';
    $('#mon-bars').innerHTML = '';
  }
  // chefe
  const z = zoneById(S.zone);
  const k = S.zoneKills[S.zone] || 0;
  $('#zone-title').innerHTML = `${z.icon} ${z.name} <span class="muted">(Nv. ${z.min}+)</span>`;
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
  const lbl = { atk: 'ataque', def: 'defesa', crit: 'crítico', spd: 'velocidade' };
  if (s.type === 'dmg') return `Causa ${Math.round(s.mult * 100)}% de dano. Recarga ${s.cd}s, ${s.mp} MP.`;
  if (s.type === 'heal') return `Cura ${Math.round(s.mult * 100)}% da vida máxima. Recarga ${s.cd}s, ${s.mp} MP.`;
  return `+${Math.round(s.val * 100)}% de ${lbl[s.stat]} por ${s.dur}s. Recarga ${s.cd}s, ${s.mp} MP.`;
}

function renderLog() {
  $('#log').innerHTML = R.log.slice(0, 40).map((l) => `<div class="log-line lg-${l.cls}">${l.msg}</div>`).join('');
}

function renderTab() {
  for (const b of document.querySelectorAll('.tab-btn')) b.classList.toggle('active', b.dataset.tab === R.tab);
  const el = $('#tab-content');
  const fn = { mapas: tabMaps, inventario: tabInv, habilidades: tabSkills, loja: tabShop, refino: tabRefine, config: tabConfig }[R.tab];
  el.innerHTML = fn();
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
      <div><b>${esc(s.name)}</b> <span class="tag ${s.type}">${{ dmg: 'Ataque', buff: 'Bônus', heal: 'Cura' }[s.type]}</span><br><small class="muted">${skillDesc(s)}</small></div>
      ${locked ? `<span class="lock">🔒 Nv.${s.lvl}</span>` : `<button class="btn small ${on ? 'primary' : ''}" data-toggle-skill="${s.id}">${on ? 'Ligada' : 'Desligada'}</button>`}
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
  S.gold += v;
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
  S.gold += total;
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
    toast(`Sucesso! ${it.name} +${it.refine}`, 'good');
  } else {
    if (r.risk) it.refine--;
    log(`💔 O refino falhou${r.risk ? ` e ${esc(it.name)} caiu para +${it.refine}` : ''}.`, 'death');
    toast('O refino falhou...', 'bad');
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
  const t = e.target.closest('[data-play],[data-del],[data-new],[data-faction],[data-cls],[data-attr],[data-zone],[data-tab],[data-item],[data-eq],[data-act],[data-buy],[data-ref],[data-toggle-skill],[data-skill],#create-btn,#create-back,#boss-btn,#modal-close,#btn-exit');
  if (!t) return;
  const ds = t.dataset;
  if (ds.play !== undefined) return startGame(+ds.play);
  if (ds.del !== undefined) {
    if (confirm('Excluir este personagem permanentemente?')) { deleteSlot(+ds.del); renderSelect(); }
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
  if (t.id === 'modal-close') { $('#modal').classList.add('hidden'); return; }
  if (!S) return;
  if (ds.attr) {
    const n = Math.min(+ds.n, S.pts);
    if (n > 0) { S.attr[ds.attr] += n; S.pts -= n; renderChar(); }
    return;
  }
  if (t.id === 'boss-btn') { if ((S.zoneKills[S.zone] || 0) >= 25) { R.bossFight = true; R.mon = null; R.respawn = 0.3; log('Você desafiou o chefe do mapa!', 'boss'); } return; }
  if (ds.zone) {
    if (ds.zone !== S.zone) { S.zone = ds.zone; R.mon = null; R.respawn = 0.5; R.bossFight = false; log(`Você viajou para ${zoneById(ds.zone).name}.`, 'muted'); }
    return renderTab();
  }
  if (ds.tab) { R.tab = ds.tab; return renderTab(); }
  if (ds.item) { R.sel = ds.item; R.selEq = null; return renderTab(); }
  if (ds.eq) { R.selEq = ds.eq; R.sel = null; R.tab = 'inventario'; return renderTab(); }
  if (ds.ref) { R.refSel = ds.ref; return renderTab(); }
  if (ds.toggleSkill) { S.skillOff[ds.toggleSkill] = !S.skillOff[ds.toggleSkill]; renderSkillBar(); return renderTab(); }
  if (ds.skill) { if (S.lvl >= CLASSES[S.cls].skills.find((s) => s.id === ds.skill).lvl) { S.skillOff[ds.skill] = !S.skillOff[ds.skill]; renderSkillBar(); if (R.tab === 'habilidades') renderTab(); } return; }
  if (ds.buy) {
    const p = SHOP.find((x) => x.id === ds.buy), n = +ds.n;
    if (S.gold >= p.price * n) { S.gold -= p.price * n; if (p.type === 'mat') S.stones += n; else S.pots[p.id] += n; }
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
      if (!confirm(`Redistribuir todos os pontos por ${fmt(cost)} ouro?`)) break;
      S.gold -= cost;
      S.attr = { ...CLASSES[S.cls].base };
      S.pts = (S.lvl - 1) * POINTS_PER_LEVEL;
      clampVitals();
      R.dirty.all = true; break;
    }
    case 'export': {
      save();
      const code = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
      navigator.clipboard?.writeText(code).then(() => toast('Save copiado para a área de transferência!', 'good'), () => prompt('Copie seu save:', code));
      break;
    }
    case 'import': {
      const code = prompt('Cole o código do save:');
      if (!code) break;
      try {
        const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
        if (!obj.cls || !CLASSES[obj.cls]) throw new Error('inválido');
        S = obj; save(); startGame(slot); toast('Save importado!', 'good');
      } catch (err) { toast('Código de save inválido.', 'bad'); }
      break;
    }
  }
});

document.addEventListener('input', (e) => {
  const k = e.target.dataset.set;
  if (!k || !S) return;
  const v = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'range' ? +e.target.value : e.target.value);
  S.settings[k] = v;
  if (e.target.type === 'range') e.target.previousElementSibling.textContent = v + '%';
});

window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

renderSelect();
