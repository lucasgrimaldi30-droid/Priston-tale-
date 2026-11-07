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
const online = () => typeof Net !== 'undefined' && Net.isOnline();
function loadLocal(i) {
  try { const raw = localStorage.getItem(SAVE_PREFIX + i); if (raw) return JSON.parse(raw); } catch (e) { /* armazenamento bloqueado */ }
  return memSlots[i] ? JSON.parse(JSON.stringify(memSlots[i])) : null;
}
function loadSlot(i) {
  if (online()) { const c = Net.st.slots[i]; return c ? JSON.parse(JSON.stringify(c)) : null; }
  return loadLocal(i);
}
function writeSlot(i, obj) {
  if (online()) { Net.setSlot(i, obj); return true; }
  try { localStorage.setItem(SAVE_PREFIX + i, JSON.stringify(obj)); return true; } catch (e) { memSlots[i] = obj; return false; }
}
function save() {
  if (!S) return;
  S.lastSave = Date.now();
  if (online()) { Net.queueSave(slot, S); return; }
  try { localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(S)); } catch (e) { memSlots[slot] = JSON.parse(JSON.stringify(S)); }
}
function deleteSlot(i) {
  if (online()) { Net.setSlot(i, null); return; }
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
    settings: { autoHp: 50, autoMp: 30, autoSell: 'nenhum', autoBoss: false, autoBuyPots: true, autoPts: false, gfx: '3d', sfxVol: 70, musVol: 45, muted: false, auto: true, autoQuest: true, autoSkill: true, autoAlma: false, almaV2: true },
    stats: { kills: 0, deaths: 0, bosses: 0, goldEarned: 0, created: Date.now() },
    lastSave: Date.now(), tut: 0,
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
  return maybeSet(it);
}

function itemValue(it) {
  const ri = RARITIES.findIndex((r) => r.id === it.rarity);
  return Math.round((4 + it.ilvl * 3) * (1 + ri * ri * 0.8) * (1 + it.refine * 0.25));
}
function refineMult(it) { return 1 + (it.refine || 0) * 0.08; }
function rarityOf(it) { return RARITIES.find((r) => r.id === it.rarity) || RARITIES[0]; }
function canUseWeapon(it) { return it.slot !== 'arma' || CLASSES[S.cls].anyWeapon || it.wtype === CLASSES[S.cls].weapon; }

function canEquip(it) { return S.lvl >= it.req && canUseWeapon(it); }

// ---------- níveis de habilidade (1 a 10) ----------
const SKILL_MAX = 10;
function skLv(id) { return (S.skillLv && S.skillLv[id]) || 1; }
function skillPointsTotal() { return Math.floor(S.lvl * 0.6); }
function skillPointsFree() { return skillPointsTotal() - Object.values(S.skillLv || {}).reduce((a, v) => a + (v - 1), 0); }
// versão da habilidade com os bônus do nível atual
function skillAt(s) {
  const L = skLv(s.id) - 1;
  const o = { ...s, lv: L + 1 };
  if (!L) return o;
  if (s.mult != null) o.mult = +(s.mult * (1 + (s.type === 'heal' ? 0.08 : s.type === 'summon' ? 0.1 : 0.12) * L)).toFixed(3);
  if (s.cd) o.cd = +(s.cd * (1 - 0.03 * L)).toFixed(1);
  if (s.mp) o.mp = Math.round(s.mp * (1 + 0.05 * L));
  if (s.val != null) o.val = +(s.val * (1 + 0.06 * L)).toFixed(3);
  if (s.also) o.also = { ...s.also, val: +(s.also.val * (1 + 0.06 * L)).toFixed(3) };
  if (s.dur) o.dur = +(s.dur + (s.type === 'stealth' ? 0.2 : s.type === 'summon' ? 2 : 1) * L).toFixed(1);
  if (s.stun) o.stun = +(s.stun + 0.1 * L).toFixed(2);
  if (s.slow) o.slow = +(s.slow + 0.3 * L).toFixed(1);
  if (s.healPct) o.healPct = +(s.healPct * (1 + 0.06 * L)).toFixed(3);
  if (s.revive) o.revive = Math.round(s.revive * (1 - 0.04 * L));
  return o;
}
function classSkills() { return CLASSES[S.cls].skills.map(skillAt); }
// gasta os pontos automaticamente: primeiro as habilidades de dano e área, depois o resto
function autoSkillPoints() {
  if (!S.settings.autoSkill) return;
  const order = { aoe: 0, dmg: 1, summon: 2, buff: 3, heal: 3, passive: 4, stealth: 5 };
  let guard = 60;
  while (skillPointsFree() > 0 && guard-- > 0) {
    const c = CLASSES[S.cls].skills.filter((x) => S.lvl >= x.lvl && skLv(x.id) < SKILL_MAX).sort((a, b) => skLv(a.id) - skLv(b.id) || order[a.type] - order[b.type])[0];
    if (!c) break;
    S.skillLv = S.skillLv || {}; S.skillLv[c.id] = skLv(c.id) + 1;
  }
}
function upgradeSkill(id) {
  const sk = CLASSES[S.cls].skills.find((x) => x.id === id);
  if (!sk || S.lvl < sk.lvl || skLv(id) >= SKILL_MAX || skillPointsFree() <= 0) return;
  S.skillLv = S.skillLv || {}; S.skillLv[id] = skLv(id) + 1;
  Sfx.play('refineOk'); log(`📈 ${esc(sk.name)} subiu para o nível ${S.skillLv[id]}!`, 'lvl');
  renderSkillBar(); renderTab();
}

// ---------- especialização de classe (nível 50) ----------
const SPEC_LVL = 50;
const SPECS = {
  gladiador:  [{ id: 'berserker', name: 'Berserker', icon: '🩸', desc: '+20% ataque, +10% velocidade, +20% dano em alvo único, −10% defesa', b: { atkp: 20, spd: 0.1, singleMult: 0.2, defp: -10 } },
               { id: 'guardiao', name: 'Guardião', icon: '🛡️', desc: '+30% defesa, +20% vida, +10% bloqueio, +10% dano em área', b: { defp: 30, hpp: 20, block: 0.1, aoeMult: 0.1 } }],
  engenheiro: [{ id: 'forjador', name: 'Forjador', icon: '🤖', desc: 'Autômato +60% mais forte, +20% defesa', b: { petMult: 0.6, defp: 20 } },
               { id: 'demolidor', name: 'Demolidor', icon: '💥', desc: '+30% dano em área, +10% ataque', b: { aoeMult: 0.3, atkp: 10 } }],
  cacadora:   [{ id: 'atiradora', name: 'Atiradora de Elite', icon: '🎯', desc: '+10% crítico, +40% dano crítico, +15% alvo único', b: { crit: 10, critdmg: 0.4, singleMult: 0.15 } },
               { id: 'feras', name: 'Mestra das Feras', icon: '🦅', desc: 'Falcão +80% mais forte, +10% velocidade', b: { petMult: 0.8, spd: 0.1 } }],
  lanceiro:   [{ id: 'ceifador', name: 'Ceifador', icon: '🌀', desc: '+30% dano em área, +10% ataque', b: { aoeMult: 0.3, atkp: 10 } },
               { id: 'assassino', name: 'Assassino', icon: '🗡️', desc: '+8% crítico, +60% dano crítico, +10% alvo único', b: { crit: 8, critdmg: 0.6, singleMult: 0.1 } }],
  paladino:   [{ id: 'cruzado', name: 'Cruzado', icon: '✝️', desc: '+50% contra mortos-vivos, +20% área, +10% ataque', b: { undead: 0.5, aoeMult: 0.2, atkp: 10 } },
               { id: 'protetor', name: 'Protetor', icon: '🏰', desc: '+15% bloqueio, +25% defesa, +15% vida', b: { block: 0.15, defp: 25, hpp: 15 } }],
  valquiria:  [{ id: 'tempestade', name: 'Tempestade', icon: '🌪️', desc: '+30% dano em área, +10% velocidade', b: { aoeMult: 0.3, spd: 0.1 } },
               { id: 'escudeira', name: 'Escudeira', icon: '🛡️', desc: '+15% bloqueio, +20% defesa, Fera Alada +40%', b: { block: 0.15, defp: 20, petMult: 0.4 } }],
  arcanista:  [{ id: 'piromante', name: 'Piromante', icon: '🔥', desc: '+30% dano em área, +10% ataque', b: { aoeMult: 0.3, atkp: 10 } },
               { id: 'criomante', name: 'Criomante', icon: '❄️', desc: '+20% escudo de mana, +15% vida, +15% alvo único', b: { mshield: 0.2, hpp: 15, singleMult: 0.15 } }],
  cleriga:    [{ id: 'santa', name: 'Santa', icon: '😇', desc: 'Curas +50%, +20% vida, bônus duram +30%', b: { healMult: 0.5, hpp: 20, buffDur: 0.3 } },
               { id: 'inquisidora', name: 'Inquisidora', icon: '⚡', desc: '+25% ataque, +20% área, +40% contra mortos-vivos', b: { atkp: 25, aoeMult: 0.2, undead: 0.4 } }],
};
function specOf() { return S.spec && (SPECS[S.cls] || []).find((x) => x.id === S.spec); }
function chooseSpec(id) {
  const sp = (SPECS[S.cls] || []).find((x) => x.id === id); if (!sp || S.lvl < SPEC_LVL) return;
  const cost = S.spec ? 20000 * S.lvl : 0;
  if (S.spec === id) return;
  if (cost && S.gold < cost) { toast(`Trocar de especialização custa ${fmt(cost)} ouro.`, 'bad'); return; }
  S.gold -= cost; S.spec = id;
  log(`${sp.icon} Especialização escolhida: <b>${sp.name}</b>!`, 'lvl'); Sfx.play('levelup'); Scene.levelUp();
  renderTab(); renderHeader();
}

// ---------- mascotes que evoluem ----------
function petLevel(id) { const k = (S.petXp && S.petXp[id]) || 0; return Math.min(10, 1 + Math.floor(Math.sqrt(k / 60))); }
function petMult(id) { return 1 + (petLevel(id) - 1) * 0.15; }

// ---------- bestiário ----------
const BEST_TIERS = [50, 250, 1000];
function bestTiers() { let n = 0; for (const k in (S.best || {})) for (const t of BEST_TIERS) if (S.best[k] >= t) n++; return n; }
function tabBestiary() {
  S.best = S.best || {};
  const all = ALL_ZONES.flatMap((z) => [...z.monsters.map((m) => ({ n: m[0], i: m[1], z })), { n: z.boss[0], i: z.boss[1], z, boss: true }]);
  const tiers = bestTiers();
  return `<p class="muted">Cada marco (50, 250 e 1.000 derrotados) de cada monstro dá <b>+0,25% de dano e de experiência</b> para sempre. Total atual: <b>+${(tiers * 0.25).toFixed(2)}%</b> (${tiers}/${all.length * 3} marcos).</p>
  <div class="best-grid">${all.map((m) => { const k = S.best[m.n] || 0, next = BEST_TIERS.find((t) => k < t); return `<div class="best-card ${k ? '' : 'unknown'}"><span class="best-ico">${k ? m.i : '❔'}</span><b>${k ? esc(m.n) : '???'}</b><small class="muted">${esc(m.z.name)}${m.boss ? ' · chefe' : ''}</small><small>${fmt(k)} derrotados ${BEST_TIERS.map((t) => (k >= t ? '★' : '☆')).join('')}</small>${next ? `<div class="q-prog"><i style="width:${Math.min(100, k / next * 100)}%"></i></div>` : '<small class="good">Completo!</small>'}</div>`; }).join('')}</div>`;
}

// ---------- medidor de dano e estatísticas ----------
function meter() { if (!R.meter) R.meter = { start: Date.now(), dmg: 0, xp: 0, gold: 0, kills: 0, bySk: {}, recent: [] }; return R.meter; }
function meterHit(dmg, name) {
  const M = meter(), now = Date.now();
  M.dmg += dmg; M.bySk[name] = (M.bySk[name] || 0) + dmg; M.recent.push([now, dmg]);
  while (M.recent.length && now - M.recent[0][0] > 30000) M.recent.shift();
}
function tabStats() {
  const M = meter(), hrs = Math.max(1 / 60, (Date.now() - M.start) / 3600000), now = Date.now();
  const dps = M.recent.reduce((a, r) => a + r[1], 0) / Math.max(1, Math.min(30, (now - (M.recent[0] ? M.recent[0][0] : now)) / 1000 || 1));
  const top = Object.entries(M.bySk).sort((a, b) => b[1] - a[1]).slice(0, 6), total = Object.values(M.bySk).reduce((a, v) => a + v, 0) || 1;
  return `<div class="stat-cards">
    <div><small>Dano por segundo (30 s)</small><b>${fmt(dps)}</b></div><div><small>Experiência por hora</small><b>${fmt(M.xp / hrs)}</b></div>
    <div><small>Ouro por hora</small><b>${fmt(M.gold / hrs)}</b></div><div><small>Abates por hora</small><b>${fmt(M.kills / hrs)}</b></div></div>
    <div class="q-sec">De onde vem o seu dano</div>
    ${top.map(([n, v]) => `<div class="dmg-row"><span>${esc(n)}</span><div class="q-prog"><i style="width:${v / total * 100}%"></i></div><small>${Math.round(v / total * 100)}%</small></div>`).join('') || '<p class="muted">Lute um pouco para ver os números.</p>'}
    <p class="muted">Medindo há ${Math.round(hrs * 60)} min. <button class="btn tiny" data-act="meter-reset">Zerar</button></p>`;
}

// ---------- conjuntos de equipamento ----------
const SETS = {
  guardiao: { name: 'Guardião de Ferro', tier: 2, color: '#7ac0ff', b2: { defp: 20 }, b4: { hpp: 15, block: 0.1 }, d2: '+20% de defesa', d4: '+15% de vida e +10% de bloqueio' },
  sombra:   { name: 'Sombra Rúnica', tier: 3, color: '#b070ff', b2: { crit: 8 }, b4: { critdmg: 0.4 }, d2: '+8% de crítico', d4: '+40% de dano crítico' },
  furia:    { name: 'Fúria Dracônica', tier: 4, color: '#ff6040', b2: { atkp: 15 }, b4: { spd: 0.1, atkp: 10 }, d2: '+15% de ataque', d4: '+10% de velocidade e +10% de ataque' },
  celeste:  { name: 'Ascensão Celestial', tier: 5, color: '#ffe080', b2: { hpp: 15, xpb: 10 }, b4: { atkp: 20, hpp: 10 }, d2: '+15% de vida e +10% de experiência', d4: '+20% de ataque e +10% de vida' },
};
const SET_SLOTS = ['armadura', 'elmo', 'luvas', 'botas'];
// itens raros ou melhores de armadura podem nascer como peça de conjunto do seu tier
function maybeSet(it) {
  if (!SET_SLOTS.includes(it.slot) || RARITIES.findIndex((r) => r.id === it.rarity) < 2 || Math.random() > 0.18) return it;
  const tier = clamp(Math.floor(it.ilvl / 17), 0, 5), id = Object.keys(SETS).find((k) => SETS[k].tier === tier);
  if (!id) return it;
  it.set = id; it.name = `${it.name} · ${SETS[id].name}`;
  return it;
}
function setCounts() { const c = {}; for (const sl of SET_SLOTS) { const it = S.equip[sl]; if (it && it.set && S.lvl >= it.req) c[it.set] = (c[it.set] || 0) + 1; } return c; }
function setBonus(b) {
  const c = setCounts();
  for (const id in c) { const st = SETS[id]; for (const [k, need] of [['b2', 2], ['b4', 4]]) if (c[id] >= need) for (const st2 in st[k]) b[st2] = (b[st2] || 0) + st[k][st2]; }
}

// ---------- gemas e forja ----------
function gemBag() { if (!S.gems) S.gems = {}; for (const k in GEMS) if (!S.gems[k]) S.gems[k] = [0, 0, 0, 0, 0]; return S.gems; }
function sockets(it) { return Math.max(0, RARITIES.findIndex((r) => r.id === it.rarity)); }
function dropGem(chance, lvl) {
  if (Math.random() >= chance) return;
  const types = Object.keys(GEMS), t = types[rint(0, types.length - 1)];
  const l = Math.min(4, Math.floor(Math.random() * (1 + lvl / 40)));
  gemBag()[t][l]++;
  log(`${GEMS[t].icon} Você encontrou ${GEMS[t].name} nível ${l + 1}!`, 'loot'); Sfx.play('loot', { rarity: 2 + l, gap: 100 });
}
function gemBonus(bonus) {
  for (const sl of SLOT_ORDER) { const it = S.equip[sl]; if (!it || !it.gems) continue;
    for (const g of it.gems) { const v = GEMS[g.t].per * g.l;
      if (g.t === 'rubi') bonus.atkp += v; else if (g.t === 'safira') bonus.mp += v; else if (g.t === 'esmeralda') bonus.crit += v; else if (g.t === 'topazio') bonus.evadep += v; else bonus.hp += v; } }
}
function socketGem(uid, t) {
  const it = allItems().find((x) => x.uid === uid); const bag = gemBag()[t];
  if (!it || (it.gems || []).length >= sockets(it)) return;
  let l = 4; while (l >= 0 && !bag[l]) l--; if (l < 0) return;
  bag[l]--; (it.gems = it.gems || []).push({ t, l: l + 1 });
  Sfx.play('refineOk'); log(`${GEMS[t].icon} ${GEMS[t].name} nv ${l + 1} encaixada em ${esc(it.name)}.`, 'lvl'); R.dirty.all = true;
}
function unsocketGem(uid, i) {
  const it = allItems().find((x) => x.uid === uid); if (!it || !it.gems || !it.gems[i]) return;
  const g = it.gems[i], cost = 500 * g.l;
  if (S.gold < cost) { toast(`Remover custa ${fmt(cost)} ouro.`, 'bad'); return; }
  S.gold -= cost; gemBag()[g.t][g.l - 1]++; it.gems.splice(i, 1); Sfx.play('coin'); R.dirty.all = true;
}
function combineGem(t, l) {
  const bag = gemBag()[t], cost = 1000 * (l + 1);
  if (l >= 4 || bag[l] < 3 || S.gold < cost) return;
  bag[l] -= 3; bag[l + 1]++; S.gold -= cost;
  Sfx.play('refineOk'); log(`✨ 3 ${GEMS[t].name} nv ${l + 1} viraram 1 ${GEMS[t].name} nv ${l + 2}!`, 'lvl'); renderTab();
}
function forgeCost() { return { gold: 400 * S.lvl, stones: 3 + Math.floor(S.lvl / 20) }; }
function forgeItem(slotName) {
  const c = forgeCost();
  if (S.gold < c.gold || S.stones < c.stones) { toast('Ouro ou pedras insuficientes.', 'bad'); return; }
  if (S.inv.length >= 40) { toast('Mochila cheia.', 'bad'); return; }
  S.gold -= c.gold; S.stones -= c.stones;
  const it = genItem(S.lvl, 6, slotName); it.req = Math.min(it.req, S.lvl);
  S.inv.push(it); Sfx.play('refineOk');
  log(`🔨 O Ferreiro forjou <span style="color:${rarityOf(it).color}">${esc(it.name)}</span> (${rarityOf(it).name})!`, 'loot');
  R.sel = it.uid; R.refSel = it.uid; renderTab();
}
function allItems() { return [...SLOT_ORDER.map((sl) => S.equip[sl]).filter(Boolean), ...S.inv]; }
function buyShop(id, n) {
  const p = SHOP.find((x) => x.id === id); if (!p) return;
  S.owned = S.owned || {};
  if ((p.type === 'mount' || p.type === 'pet') && S.owned[id]) { // usar/guardar
    if (p.type === 'mount') S.mount = S.mount === id ? null : id; else S.companion = S.companion === id ? null : id;
    Sfx.play('click'); return renderTab();
  }
  const cost = p.price * (p.type === 'mount' || p.type === 'pet' ? 1 : n);
  if (S.gold < cost) return;
  S.gold -= cost; Sfx.play('coin');
  if (p.type === 'mat') S.stones += n;
  else if (p.type === 'scroll') { S.xpBoostUntil = Math.max(Date.now(), S.xpBoostUntil || 0) + n * 30 * 60000; toast('Experiência +50% ativada!', 'good'); }
  else if (p.type === 'gembag') for (let i = 0; i < n; i++) { const types = Object.keys(GEMS), t = types[rint(0, types.length - 1)]; gemBag()[t][0]++; }
  else if (p.type === 'mount') { S.owned[id] = true; S.mount = id; toast(`${p.name} é seu!`, 'good'); }
  else if (p.type === 'pet') { S.owned[id] = true; S.companion = id; toast(`${p.name} agora te acompanha!`, 'good'); }
  else S.pots[p.id] = (S.pots[p.id] || 0) + n;
  renderTab();
}
function xpBoostOn() { return (S.xpBoostUntil || 0) > Date.now(); }
function mountSpeed() { const m = S.mount && SHOP.find((x) => x.id === S.mount); return m ? m.speed : 0; }

// ---------- atributos derivados ----------
function derived() {
  const c = CLASSES[S.cls];
  const bonus = { for: 0, int: 0, des: 0, agi: 0, vit: 0, hp: 0, mp: 0, crit: 0, xpb: 0, gold: 0, atkp: 0, evadep: 0 };
  let wmin = 1, wmax = 3, def = 0;
  for (const sl of SLOT_ORDER) {
    const it = S.equip[sl];
    if (!it || S.lvl < it.req) continue; // item acima do nível fica inativo
    const m = refineMult(it);
    if (sl === 'arma') {
      if (canUseWeapon(it)) { wmin = it.min * m; wmax = it.max * m; }
    } else def += it.def * m;
    for (const a of it.affixes) bonus[a.stat] += a.val;
  }
  gemBonus(bonus);
  const SB = {}; setBonus(SB);
  const SP = (specOf() || {}).b || {};
  for (const k of ['atkp', 'defp', 'hpp', 'crit', 'critdmg', 'spd', 'block']) if (SP[k]) SB[k] = (SB[k] || 0) + SP[k];
  // alma e artefato
  const SO = soulBonus(), AT = artTotal(); if (AT) SO[AT.k] = (SO[AT.k] || 0) + AT.v;
  for (const k of ['atkp', 'defp', 'hpp', 'crit', 'critdmg', 'spd', 'block']) if (SO[k]) SB[k] = (SB[k] || 0) + SO[k];
  const bt = bestTiers() * 0.25; bonus.xpb += bt; bonus.atkp += bt;
  const rb = S.rebirths || 0;
  bonus.xpb += (SB.xpb || 0) + rb * 10; bonus.gold += rb * 10; bonus.crit += SB.crit || 0; bonus.atkp += (SB.atkp || 0) + rb * 10;
  { const pc = S.companion && SHOP.find((x) => x.id === S.companion); if (pc) { const pm = petMult(pc.id); bonus.gold += (pc.gold || 0) * pm; bonus.xpb += (pc.xp || 0) * pm; } }
  const A = {};
  for (const k of ['for', 'int', 'des', 'agi', 'vit']) A[k] = S.attr[k] + bonus[k];
  const main = A[c.main];
  // buffs ativos + passivas aprendidas
  const B = {};
  for (const b of (R.buffs || [])) B[b.stat] = (B[b.stat] || 0) + b.val;
  for (const sk of classSkills()) if (sk.type === 'passive' && sk.stat && S.lvl >= sk.lvl) B[sk.stat] = (B[sk.stat] || 0) + sk.val;
  const buff = (k) => B[k] || 0;
  if (R.pet && PETS[R.pet.kind].spd) B.spd = (B.spd || 0) + PETS[R.pet.kind].spd;
  for (const k of ['critdmg', 'spd', 'block']) if (SB[k]) B[k] = (B[k] || 0) + SB[k];
  const atkMul = 1 + buff('atk') + bonus.atkp / 100;
  const baseHp = 40 + A.vit * 8 + S.lvl * 10 + bonus.hp;
  const d = {
    A,
    maxHp: Math.round(baseHp * (1 + buff('hpmax') + (SB.hpp || 0) / 100 + rb * 0.05)),
    maxMp: Math.round(15 + A.int * 4 + S.lvl * 3 + bonus.mp),
    atkMin: Math.round((wmin + main * 0.8 + S.lvl) * atkMul),
    atkMax: Math.round((wmax + main * 1.0 + S.lvl) * atkMul),
    def: Math.round((def + A.agi * 0.6 + A.vit * 0.2) * (1 + buff('def') + (SB.defp || 0) / 100)),
    crit: clamp(5 + A.des * 0.08 + bonus.crit + buff('crit') * 100, 0, 75),
    critMult: (c.critMult || 1.75) + buff('critdmg'),
    aps: c.speed * (1 + A.agi / 400) * (1 + buff('spd')),
    evade: clamp(A.agi * 0.0012 + buff('evade') + bonus.evadep / 100, 0, 0.55),
    block: clamp((S.equip.escudo ? 0.08 : 0) + buff('block'), 0, 0.6),
    absorb: clamp(buff('absorb') + (SO.absorb || 0), 0, 0.6),
    reflect: buff('reflect'),
    mshield: clamp(buff('mshield') + (SP.mshield || 0), 0, 0.8),
    undead: buff('undead') + (SP.undead || 0),
    aoeMult: SP.aoeMult || 0, singleMult: SP.singleMult || 0, petMult: SP.petMult || 0, healMult: SP.healMult || 0, buffDur: SP.buffDur || 0,
    xpb: bonus.xpb, goldb: bonus.gold,
    hpRegen: 0.01 * baseHp + A.vit * 0.1, mpRegen: 0.015 * (15 + A.int * 4 + S.lvl * 3) + A.int * 0.05,
  };
  return d;
}

// ---------- monstros ----------
function zoneById(id) { return ALL_ZONES.find((z) => z.id === id); }
function zoneSpan(z) { if (z.span) return z.span; const i = ZONES.indexOf(z); return i < ZONES.length - 1 ? ZONES[i + 1].min - z.min : 18; }
// nível de recompensa do mapa (desvio usa o do mapa de onde sai, +1)
function zoneTier(z) { return z.parent ? ZONES.findIndex((q) => q.id === z.parent) + 2 : ZONES.indexOf(z) + 1; }
const zoneIdx = (zid) => ALL_ZONES.findIndex((z) => z.id === zid);

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
// ---------- mapas ligados: saída para o mapa anterior (oeste) e o próximo (leste) ----------
// ficam no eixo da tela (a câmera olha na diagonal): próximo mapa à direita, anterior à esquerda
const EXIT_NEXT = { x: 26.3, z: -14.4 }, EXIT_PREV = { x: -26.3, z: 14.4 }, EXIT_BRANCH = { x: 12.5, z: 22.9 };
const inward = (e, d) => { const L = Math.hypot(e.x, e.z); return { x: e.x * (1 - d / L), z: e.z * (1 - d / L) }; };
function zoneExits(zid) {
  const i = ZONES.findIndex((z) => z.id === zid), out = [], z = zoneById(zid);
  if (z && z.parent) return [{ to: z.parent, x: EXIT_PREV.x, z: EXIT_PREV.z, side: 'prev' }]; // desvio: só volta para o mapa de origem
  if (i > 0) out.push({ to: ZONES[i - 1].id, x: EXIT_PREV.x, z: EXIT_PREV.z, side: 'prev' });
  if (i >= 0 && i < ZONES.length - 1) out.push({ to: ZONES[i + 1].id, x: EXIT_NEXT.x, z: EXIT_NEXT.z, side: 'next' });
  for (const b of BRANCHES) if (b.parent === zid) out.push({ to: b.id, x: EXIT_BRANCH.x, z: EXIT_BRANCH.z, side: 'branch' });
  return out;
}
function exitLocked(ex) { return S.lvl < zoneById(ex.to).min - 3; }
function nearExit(r) { return R.pos ? zoneExits(S.zone).find((e) => dist2(e, R.pos) < r) : null; }
function walkZone(ex) {
  const nz = zoneById(ex.to);
  if (exitLocked(ex)) { toast(`🔒 ${nz.name} abre no nível ${nz.min - 3}.`, 'bad'); R.move = null; R.travel = null; R.pos = inward(ex, 2.5); return; }
  const from = S.zone, back = zoneExits(ex.to).find((e) => e.to === from);
  S.zone = ex.to; R.worldZone = null; R.mon = null; R.move = null; R.bossFight = false; R.travel = null;
  if (nz.parent) { S.visited = S.visited || {}; if (!S.visited[nz.id]) { S.visited[nz.id] = 1; log(`🧭 Você descobriu <b>${esc(nz.name)}</b>!`, 'lvl'); } }
  R.arrive = back ? inward(back, 3.5) : null;
  log(`🚶 Você chegou a <b>${nz.icon} ${esc(nz.name)}</b> (Nv. ${nz.min}+).`, 'muted'); toast(`${nz.icon} ${nz.name}`);
  Sfx.play('portal'); R.dirty.all = true;
  if (R.win === 'mapas') renderTab();
}
// o Auto anda até o mapa do seu nível pelas saídas (em vez de teleportar)
function travelStep(dt, speed) {
  if (!S.settings.auto || S.settings.autoTravel === false || R.dungeon) { R.travel = null; return false; }
  R.travelT = (R.travelT || 0) - dt;
  if (!R.travel && R.travelT <= 0) {
    R.travelT = 4;
    const cz = zoneById(S.zone);
    if (cz && cz.parent && S.lvl >= cz.min + cz.span + 2) { R.travel = zoneExits(S.zone)[0]; log(`🚶 Este mapa ficou fácil. Voltando para ${esc(zoneById(cz.parent).name)}...`, 'muted'); }
    const i = ZONES.findIndex((z) => z.id === S.zone), nx = i >= 0 && ZONES[i + 1];
    if (!R.travel && nx && S.lvl >= nx.min + 1 && !R.mons.some((m) => m.boss && m.aggro)) { R.travel = zoneExits(S.zone).find((e) => e.side === 'next'); if (R.travel) log(`🚶 Você já está forte para ${nx.icon} ${esc(nx.name)}. Indo para lá a pé...`, 'muted'); }
  }
  if (!R.travel) return false;
  if (aliveMons().some((m) => m.aggro && !m.returning && dist2(m, R.pos) < 8)) return false; // luta primeiro, depois segue viagem
  R.mon = null; R.gather = null; R.gathering = false;
  R.face = Math.atan2(R.travel.z - R.pos.z, R.travel.x - R.pos.x); R.moving = true;
  stepTo(R.pos, R.travel, speed * dt);
  if (dist2(R.pos, R.travel) < 1.8) walkZone(R.travel);
  return true;
}
// monstros que vêm dos mapas vizinhos e errantes raros
const ROAM_CHANCE = 0.015, BORDER_CHANCE = 0.16;
function spawnSource() {
  const z = zoneById(S.zone), span = zoneSpan(z), exits = zoneExits(S.zone);
  if (exits.length && Math.random() < BORDER_CHANCE) {
    const ex = exits[rint(0, exits.length - 1)], nz = zoneById(ex.to), ns = zoneSpan(nz), mi = rint(0, 2);
    const lvl = ex.side === 'prev' ? nz.min + ns - rint(1, 3) : nz.min + rint(0, 2);
    return { mon: nz.monsters[mi], lvl, center: inward(ex, 6 + rint(0, 4)), spread: 3.5, border: nz.name };
  }
  const camps = zoneCamps(S.zone), c = camps[rint(0, camps.length - 1)], i = rint(0, 2);
  return { mon: z.monsters[i], lvl: z.min + Math.floor((i / 3) * span) + rint(0, Math.max(1, Math.floor(span / 3))), center: c, spread: 3 };
}
const RANGED_W = { arco: 1, dardo: 1, cajado: 1, cetro: 1 };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function weaponRange() { return RANGED_W[curWeapon()] ? 7 : 1.8; }
function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// acampamentos de monstros fixos por mapa (mesma semente usada pela cena 3D)
function zoneCamps(zid) {
  const r = seeded(zoneIdx(zid) * 977 + 13), camps = [];
  while (camps.length < 5) {
    const a = r() * Math.PI * 2, d = 9 + r() * 18, c = { x: Math.cos(a) * d, z: Math.sin(a) * d * 0.9 };
    if (dist2(c, WORLD.entry) > 9 && dist2(c, WORLD.arena) > 8 && dist2(c, EXIT_PREV) > 8 && dist2(c, EXIT_NEXT) > 8 && dist2(c, EXIT_BRANCH) > 8 && camps.every((o) => dist2(o, c) > 8)) camps.push(c);
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
  for (let tries = 0; tries < 12; tries++) {
    const src = spawnSource(), c = src.center, a = Math.random() * Math.PI * 2, d = Math.random() * src.spread;
    const pos = { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d };
    if (R.pos && dist2(pos, R.pos) < (initial ? 6 : 9)) continue;
    const m = makeMonster(src.mon[0], src.mon[1], Math.max(1, src.lvl), false, 2);
    Object.assign(m, { x: pos.x, z: pos.z, home: { x: c.x, z: c.z }, wp: null, wait: Math.random() * 3 });
    if (src.border) m.border = src.border;
    if (!initial && !R.dungeon && Math.random() < ROAM_CHANCE && !R.mons.some((o) => o.roamer)) { // errante raro: elite forte que cruza o mapa
      m.roamer = true; m.elite = true; m.skin = m.name; m.name = m.name + ' Errante';
      m.maxHp = m.hp = Math.round(m.maxHp * 4); m.atk = Math.round(m.atk * 1.5); m.def = Math.round(m.def * 1.2); m.xp *= 7; m.gold *= 7;
      R.mons.push(m);
      log(`👣 Um <b>${esc(m.name)}</b> está cruzando o mapa! Ele deixa prêmios raros.`, 'boss');
      return m;
    }
    m.xp = Math.round(m.xp * 1.3); m.gold = Math.round(m.gold * 1.15); // compensa o tempo andando
    if (Math.random() < (R.dungeon ? 0.18 : 0.07) * (eventNow().id === 'elite' ? 3 : 1)) { // monstro elite
      m.elite = true; m.maxHp = m.hp = Math.round(m.maxHp * 2.6); m.atk = Math.round(m.atk * 1.35); m.def = Math.round(m.def * 1.15);
      m.xp *= 4; m.gold *= 4;
    }
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
  R.worldZone = S.zone; R.mons = []; R.mon = null; R.move = null; R.spawnT = 0; R.playerTimer = 0.3; R.tele = []; R.gather = null; R.travel = null;
  R.nodes = zoneNodes(S.zone).map((n, i) => ({ ...n, id: i, cd: 0 }));
  R.pos = R.arrive ? { ...R.arrive } : { ...WORLD.entry }; R.arrive = null;
  for (let i = 0; i < WORLD.cap; i++) spawnWorldMonster(true);
}
// ---------- eventos do mundo (pelo relógio real, iguais para todos os jogadores) ----------
// a cada 30 minutos começa um evento de 10 minutos, em rodízio
const EVENTS = [
  { id: 'xp', name: 'Maré da Sabedoria', icon: '📘', desc: '+50% de experiência em todos os mapas.' },
  { id: 'gold', name: 'Chuva de Ouro', icon: '💰', desc: '+50% de ouro dos monstros.' },
  { id: 'elite', name: 'Hora das Elites', icon: '⭐', desc: 'Monstros elite aparecem 3× mais.' },
  { id: 'boss', name: 'Chefe Mundial', icon: '🔥', desc: 'Um Avatar gigante surge na arena de cada mapa. Derrote-o por um grande prêmio.' },
];
const EV_SLOT = 30 * 60000, EV_LEN = 10 * 60000;
function eventNow(t = Date.now()) {
  const slot = Math.floor(t / EV_SLOT), into = t - slot * EV_SLOT, e = EVENTS[slot % EVENTS.length];
  if (into < EV_LEN) return { ...e, slot, left: EV_LEN - into };
  const ne = EVENTS[(slot + 1) % EVENTS.length];
  return { id: null, slot, next: ne, nextIn: EV_SLOT - into };
}
function eventTick() {
  const ev = eventNow();
  if (ev.id !== R.lastEv) {
    if (ev.id) { log(`${ev.icon} <b>Evento: ${ev.name}!</b> ${ev.desc} (10 min)`, 'boss'); toast(`${ev.icon} Evento: ${ev.name}!`, 'good'); }
    else if (R.lastEv) log('O evento terminou.', 'muted');
    R.lastEv = ev.id; R.dirty.all = true;
  }
  if (ev.id === 'boss' && !R.inTown && !R.dungeon && R.pos && S.wbSlot !== ev.slot && S.lvl >= 5 && !R.mons.some((m) => m.wboss)) spawnWorldBoss(ev.slot);
  if (ev.id !== 'boss' && R.mons) { const wb = R.mons.find((m) => m.wboss && m.hp > 0); if (wb) { R.mons = R.mons.filter((m) => m !== wb); if (R.mon === wb) R.mon = null; log(`🔥 ${esc(wb.name)} desapareceu com o fim do evento.`, 'muted'); } }
}
function spawnWorldBoss(slot) {
  const z = zoneById(S.zone);
  const m = makeMonster(z.boss[0], z.boss[1], z.min + zoneSpan(z) + 4, true, 1);
  Object.assign(m, { x: WORLD.arena.x, z: WORLD.arena.z, home: { ...WORLD.arena }, wp: null, wait: 2, wboss: true, slot, skin: z.boss[0] });
  m.name = 'Avatar de ' + z.boss[0];
  m.maxHp = m.hp = Math.round(m.maxHp * 5); m.atk = Math.round(m.atk * 1.15);
  m.xp *= 3; m.gold *= 4;
  R.mons = R.mons.filter((x) => !x.boss); R.mons.push(m);
  log(`🔥 <b>${esc(m.name)}</b> despertou na arena ao norte! Derrote-o antes do fim do evento.`, 'boss'); Sfx.play('boss');
}
function worldBossReward(m) {
  S.wbSlot = m.slot; S.stats.wbosses = (S.stats.wbosses || 0) + 1;
  const tier = zoneTier(zoneById(S.zone)), st = 3 + tier;
  S.stones += st;
  for (let i = 0; i < 2; i++) dropItem(genItem(m.lvl, 6));
  dropGem(1, m.lvl); dropGem(1, m.lvl);
  log(`🔥 <b>Chefe Mundial derrotado!</b> +${st} 💎, 2 itens épicos ou melhores e 2 gemas.`, 'lvl');
  toast('Chefe Mundial derrotado!', 'good'); Sfx.play('levelup');
}

// ---------- coleta e profissões ----------
const MATS = { minerio: { name: 'Minério', icon: '⛏️' }, erva: { name: 'Erva', icon: '🌿' }, essencia: { name: 'Essência', icon: '✨' } };
const NODE_TYPES = ['minerio', 'erva', 'minerio', 'erva', 'erva', 'essencia'];
const NODE_CD = 60, GATHER_T = 2.2;
function zoneNodes(zid) {
  const r = seeded(zoneIdx(zid) * 389 + 71), camps = zoneCamps(zid), out = [];
  for (let k = 0; k < 400 && out.length < NODE_TYPES.length; k++) {
    const a = r() * Math.PI * 2, dd = 7 + r() * 22, c = { x: Math.cos(a) * dd, z: Math.sin(a) * dd * 0.9 };
    if (dist2(c, WORLD.entry) > 5 && dist2(c, WORLD.arena) > 8 && dist2(c, EXIT_PREV) > 6 && dist2(c, EXIT_NEXT) > 6 && dist2(c, EXIT_BRANCH) > 6 && camps.every((o) => dist2(o, c) > 5) && out.every((o) => dist2(o, c) > 6)) out.push({ ...c, type: NODE_TYPES[out.length] });
  }
  return out;
}
function profLvl(k) { return Math.min(50, 1 + Math.floor(Math.sqrt(((S.prof || {})[k] || 0) / 8))); }
function addMat(k, n) { S.mats = S.mats || {}; S.mats[k] = (S.mats[k] || 0) + n; }
function gatherDone(nd) {
  const tier = zoneTier(zoneById(S.zone)), lv0 = profLvl('coleta');
  let n = 1 + Math.floor(tier / 3) + (Math.random() < lv0 * 0.02 ? 1 : 0);
  if (nd.type === 'essencia') n = Math.max(1, Math.ceil(n / 2));
  addMat(nd.type, n); nd.cd = NODE_CD;
  S.prof = S.prof || {}; S.prof.coleta = (S.prof.coleta || 0) + 1 + tier;
  if (Math.random() < 0.06) { addMat('essencia', 1); n += 0; log('✨ Você achou uma Essência extra!', 'loot'); }
  log(`${MATS[nd.type].icon} Coletou ${n} ${MATS[nd.type].name}.`, 'loot');
  Sfx.play('loot', { rarity: 1, gap: 100 });
  if (profLvl('coleta') > lv0) { log(`⛏️ Coleta subiu para o nível ${profLvl('coleta')}!`, 'lvl'); toast(`Coleta nível ${profLvl('coleta')}!`, 'good'); }
  dailyProgress('gather');
  R.dirty.inv = true;
}
// passo da coleta dentro do playerAI; devolve true enquanto estiver coletando
function gatherStep(dt, speed) {
  if (!R.gather && S.settings.auto && S.settings.autoGather !== false && !R.mon && R.nodes && !aliveMons().some((m) => m.aggro && !m.returning)) {
    let best = null, bd = 14;
    for (const nd of R.nodes) { const dd = dist2(nd, R.pos); if (nd.cd <= 0 && dd < bd) { bd = dd; best = nd; } }
    if (best) R.gather = { id: best.id, t: 0 };
  }
  if (!R.gather) { R.gathering = false; return false; }
  const nd = R.nodes && R.nodes[R.gather.id];
  if (!nd || nd.cd > 0 || (R.mon && R.mon.aggro)) { R.gather = null; R.gathering = false; return false; }
  R.face = Math.atan2(nd.z - R.pos.z, nd.x - R.pos.x);
  if (dist2(R.pos, nd) > 1.3) { stepTo(R.pos, nd, speed * dt, 1.1); R.moving = true; R.gathering = false; return true; }
  R.gathering = true; R.gather.t += dt;
  if (R.gather.t >= GATHER_T) { gatherDone(nd); R.gather = null; R.gathering = false; }
  return true;
}
const RECIPES = [
  { id: 'vida', name: '5 Poções de Vida Maior', icon: '❤️', cost: { erva: 4 }, give: () => { S.pots.hp2 = (S.pots.hp2 || 0) + 5; } },
  { id: 'mana', name: '5 Poções de Mana Maior', icon: '💙', cost: { erva: 4 }, give: () => { S.pots.mp2 = (S.pots.mp2 || 0) + 5; } },
  { id: 'pedra', name: 'Pedra de Refino', icon: '💎', cost: { minerio: 12, essencia: 2 }, give: () => { S.stones++; } },
  { id: 'gema', name: 'Gema aleatória', icon: '🔮', cost: { minerio: 4, essencia: 6 }, give: () => { dropGem(1, S.lvl); } },
  { id: 'xp', name: 'Pergaminho de XP (30 min)', icon: '📜', cost: { erva: 10, essencia: 5 }, give: () => { S.xpBoostUntil = Math.max(Date.now(), S.xpBoostUntil || 0) + 30 * 60000; } },
];
function canCraft(rc) { return Object.entries(rc.cost).every(([k, n]) => ((S.mats || {})[k] || 0) >= n); }
function craft(id) {
  const rc = RECIPES.find((r) => r.id === id);
  if (!rc || !canCraft(rc)) { toast('Materiais insuficientes.', 'bad'); return; }
  for (const [k, n] of Object.entries(rc.cost)) S.mats[k] -= n;
  const lv0 = profLvl('arte'), dbl = Math.random() < Math.min(0.5, lv0 * 0.01);
  rc.give(); if (dbl) rc.give();
  S.prof = S.prof || {}; S.prof.arte = (S.prof.arte || 0) + 6;
  S.stats.crafts = (S.stats.crafts || 0) + 1;
  log(`🔨 Você criou: ${rc.icon} ${rc.name}${dbl ? ' <b>(em dobro!)</b>' : ''}.`, 'loot'); Sfx.play('loot', { rarity: 2 });
  if (profLvl('arte') > lv0) log(`🔨 Artesanato subiu para o nível ${profLvl('arte')}!`, 'lvl');
  R.dirty.inv = true; renderTab();
}
function tabCraft() {
  const m = S.mats || {};
  return `<div class="craft-head">${Object.entries(MATS).map(([k, v]) => `<span>${v.icon} ${v.name}: <b>${fmt(m[k] || 0)}</b></span>`).join('')}</div>
    <p class="muted">Colete nos pontos brilhantes do mapa (o Auto também coleta). Coleta nv. <b>${profLvl('coleta')}</b> (chance de +1 por coleta) · Artesanato nv. <b>${profLvl('arte')}</b> (${Math.min(50, profLvl('arte'))}% de chance de criar em dobro).</p>
    <div class="craft-list">${RECIPES.map((rc) => `<div class="craft-row"><span class="cr-ico">${rc.icon}</span><span class="cr-info"><b>${rc.name}</b><small>${Object.entries(rc.cost).map(([k, n]) => `${MATS[k].icon} ${n}`).join(' · ')}</small></span><button class="btn small primary" data-craft="${rc.id}" ${canCraft(rc) ? '' : 'disabled'}>Criar</button></div>`).join('')}</div>`;
}

// ---------- masmorras (3 andares + chefe) ----------
const DUN_CD = 5 * 60000;
function dunCost(z) { return 300 * z.min; }
function dunReady(zid) { return !S.dunCd || !S.dunCd[zid] || S.dunCd[zid] <= Date.now(); }
function enterDungeon(zid) {
  const z = zoneById(zid);
  if (R.dead > 0) { toast('Espere renascer para entrar.', 'bad'); return; }
  if (S.lvl < z.min) { toast(`Nível ${z.min} necessário.`, 'bad'); return; }
  if (!dunReady(zid)) { toast(`Masmorra disponível em ${Math.ceil((S.dunCd[zid] - Date.now()) / 60000)} min.`, 'bad'); return; }
  if (S.gold < dunCost(z)) { toast(`Entrada custa ${fmt(dunCost(z))} ouro.`, 'bad'); return; }
  S.gold -= dunCost(z); S.dunCd = S.dunCd || {}; S.dunCd[zid] = Date.now() + DUN_CD;
  S.zone = zid; R.inTown = false; R.dungeon = { zone: zid, floor: 1, floors: 3, next: 0 }; R.worldZone = 'dun';
  if (R.npc) { R.npc = null; $('#modal').classList.add('hidden'); $('#modal-body').classList.remove('wide'); }
  closeWin && closeWin();
  Sfx.play('portal'); log(`🕳️ Você entrou na masmorra de <b>${esc(z.name)}</b>. Limpe os 3 andares!`, 'boss');
  dungeonFloor();
  R.dirty.all = true;
}
function dungeonFloor() {
  if (R.dungeon.tower) return towerFloor();
  const D = R.dungeon, z = zoneById(D.zone), span = zoneSpan(z);
  R.mons = []; R.mon = null; R.move = null; R.tele = []; R.pos = { x: 0, z: 11 }; R.playerTimer = 0.3;
  const lvl = z.min + span;
  const n = D.floor === 3 ? 3 : 6 + D.floor * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = D.floor === 3 ? 4 : 3 + Math.random() * 6;
    const mi = rint(0, 2), m = makeMonster(z.monsters[mi][0], z.monsters[mi][1], lvl, false, 2);
    Object.assign(m, { x: Math.cos(a) * r, z: -3 + Math.sin(a) * r, wp: null, wait: 1, dun: true });
    m.home = { x: m.x, z: m.z };
    m.xp = Math.round(m.xp * 1.6); m.gold = Math.round(m.gold * 1.5);
    if (D.floor === 3 || Math.random() < 0.15 * D.floor) { m.elite = true; m.maxHp = m.hp = Math.round(m.maxHp * 3.2); m.atk = Math.round(m.atk * 1.6); m.xp *= 4; m.gold *= 4; }
    R.mons.push(m);
  }
  if (D.floor === 3) {
    const b = makeMonster(z.boss[0], z.boss[1], lvl + 4, true, 1);
    Object.assign(b, { x: 0, z: -7, home: { x: 0, z: -7 }, wp: null, wait: 2, dun: true });
    b.maxHp = b.hp = Math.round(b.maxHp * 1.3);
    R.mons.push(b);
    log(`👑 Andar final: <b>${esc(b.name)}</b> te espera!`, 'boss'); Sfx.play('boss');
  } else log(`🕳️ Andar ${D.floor}/${D.floors}: derrote todos os monstros.`, 'boss');
  if (R.coop && R.coop.lead && D.floor > 1) for (const m of R.mons) { m.maxHp = m.hp = Math.round(m.maxHp * coopScale()); }
  if (S.settings.auto) R.mon = R.mons[0];
}
function dungeonTick(dt) {
  const D = R.dungeon;
  if (aliveMons().length) return;
  if (!D.next) { D.next = 2.5; if (D.tower) towerClear(); else if (D.floor < D.floors) log(`✅ Andar ${D.floor} limpo! Descendo...`, 'lvl'); else dungeonReward(); }
  D.next -= dt;
  if (D.next <= 0) {
    if (D.floor < D.floors) { D.floor++; D.next = 0; if (D.tower) D.zone = towerZone(D.floor).id; Sfx.play('portal'); dungeonFloor(); }
    else exitDungeon(false);
  }
}
function dungeonReward() {
  const z = zoneById(R.dungeon.zone), tier = zoneTier(z); R.dungeon.done = true;
  const gold = 2500 * tier, stones = 2 + tier;
  S.gold += gold; S.stones += stones; S.stats.dungeons = (S.stats.dungeons || 0) + 1;
  for (let i = 0; i < 2; i++) dropItem(genItem(z.min + zoneSpan(z) + 2, 6));
  dropGem(1, z.min + 20); dropSoul(1, z.min + 20); dailyProgress('dungeons');
  log(`🎁 <b>Masmorra concluída!</b> Baú do tesouro: +${fmt(gold)} ouro, +${stones} 💎, 2 itens e uma gema.`, 'lvl');
  toast('Masmorra concluída!', 'good'); Sfx.play('levelup');
}
function exitDungeon(failed) {
  if (!R.dungeon) return;
  if (R.coop) { Net.soc('crelay', { k: R.coop.lead ? 'end' : 'leave', d: { done: !!R.dungeon.done } }); R.coop = null; }
  if (R.dungeon.tower) { log(`🗼 Você saiu da Torre no andar ${R.dungeon.floor}. Recorde: andar ${S.towerBest || 0}.`, 'boss'); if ((R.dungeon.cleared || 0) >= 3) dailyProgress('dungeons'); }
  R.dungeon = null; R.worldZone = null; R.mons = []; R.mon = null; R.tele = [];
  if (failed) log('💀 Você foi expulso da masmorra.', 'death');
  else log('🌀 Você voltou ao mapa.', 'muted');
  R.dirty.all = true;
}

// ---------- Torre Infinita (andares sem fim, um chefe a cada 5) ----------
function towerZone(f) { return ZONES[Math.floor((f - 1) / 5) % ZONES.length]; }
function towerStart() { return Math.max(1, Math.floor((S.towerBest || 0) / 10) * 10 + 1); }
function towerMonLvl(f) { return 3 + f * 2; }
function enterTower(from) {
  if (R.dead > 0) { toast('Espere renascer para entrar.', 'bad'); return; }
  if (S.lvl < 10) { toast('A Torre abre no nível 10.', 'bad'); return; }
  const f = from === 'top' ? towerStart() : 1;
  R.inTown = false; R.dungeon = { tower: true, zone: towerZone(f).id, floor: f, floors: Infinity, next: 0 }; R.worldZone = 'dun';
  if (R.npc) { R.npc = null; $('#modal').classList.add('hidden'); $('#modal-body').classList.remove('wide'); }
  closeWin && closeWin();
  Sfx.play('portal'); log(`🗼 Você entrou na <b>Torre Infinita</b> no andar ${f}. Suba o quanto aguentar!`, 'boss');
  dungeonFloor();
  R.dirty.all = true;
}
function towerFloor() {
  const D = R.dungeon, f = D.floor, z = towerZone(f), lvl = towerMonLvl(f);
  const over = f > 50 ? 1 + (f - 50) * 0.08 : 1; // além do andar 50 os monstros ficam cada vez mais fortes
  D.boss = f % 5 === 0;
  R.mons = []; R.mon = null; R.move = null; R.tele = []; R.pos = { x: 0, z: 11 }; R.playerTimer = 0.3;
  const n = D.boss ? 2 : 5 + Math.min(5, Math.floor(f / 6));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = D.boss ? 4 : 3 + Math.random() * 6;
    const mi = rint(0, 2), m = makeMonster(z.monsters[mi][0], z.monsters[mi][1], lvl, false, 2);
    Object.assign(m, { x: Math.cos(a) * r, z: -3 + Math.sin(a) * r, wp: null, wait: 1, dun: true, tower: true });
    m.home = { x: m.x, z: m.z };
    m.maxHp = m.hp = Math.round(m.maxHp * over); m.atk = Math.round(m.atk * over);
    if (D.boss || Math.random() < 0.12) { m.elite = true; m.maxHp = m.hp = Math.round(m.maxHp * 2.6); m.atk = Math.round(m.atk * 1.35); m.xp *= 3; m.gold *= 3; }
    R.mons.push(m);
  }
  if (D.boss) {
    const b = makeMonster(z.boss[0], z.boss[1], lvl + 3, true, 1);
    Object.assign(b, { x: 0, z: -7, home: { x: 0, z: -7 }, wp: null, wait: 2, dun: true, tower: true });
    b.maxHp = b.hp = Math.round(b.maxHp * over); b.atk = Math.round(b.atk * over);
    R.mons.push(b);
    log(`👑 Andar ${f}: o guardião <b>${esc(b.name)}</b> bloqueia a escada!`, 'boss'); Sfx.play('boss');
  } else log(`🗼 Andar ${f}: derrote todos os monstros.`, 'boss');
  if (S.settings.auto) R.mon = R.mons[0];
}
function towerClear() {
  const f = R.dungeon.floor, first = f > (S.towerBest || 0);
  R.dungeon.cleared = (R.dungeon.cleared || 0) + 1;
  const gold = Math.round(60 * f * (first ? 3 : 1));
  S.gold += gold;
  let msg = `✅ Andar ${f} vencido! +${fmt(gold)} ouro`;
  if (first) {
    S.towerBest = f;
    if (f % 5 === 0) { const st = 1 + Math.floor(f / 10); S.stones += st; dropItem(genItem(Math.min(MAX_LEVEL, towerMonLvl(f)), 5)); dropGem(1, towerMonLvl(f)); dropSoul(1, towerMonLvl(f)); msg += `, +${st} 💎, um item e uma gema`; }
    msg += ' (novo recorde!)';
  }
  log(msg + '. Subindo...', 'lvl');
  if (first && f % 10 === 0) { toast(`🗼 Recorde na Torre: andar ${f}!`, 'good'); Sfx.play('levelup'); }
}
function eventsBox() {
  const ev = eventNow(), w = worldSky(S.zone);
  const cur = ev.id ? `<b>${ev.icon} ${ev.name}</b> — ${ev.desc} <span class="muted">(acaba em ${Math.ceil(ev.left / 60000)} min)</span>` : `Próximo: <b>${ev.next.icon} ${ev.next.name}</b> em ${Math.ceil(ev.nextIn / 60000)} min <span class="muted">(${ev.next.desc})</span>`;
  return `<div class="ev-box"><div>🎉 ${cur}</div><div class="muted">${w.rain ? '🌧️ Chovendo aqui: +10% ouro' : w.isNight ? '🌙 Noite: +10% XP' : '☀️ Dia'} · um dia no mundo dura ${DAY_MIN} min</div></div>`;
}
function tabTower() {
  const best = S.towerBest || 0, st = towerStart();
  return eventsBox() + `<div class="tower-box"><h3>🗼 Torre Infinita</h3>
    <p>Andares sem fim. Cada andar é mais forte que o anterior e a cada 5 andares há um guardião. Morrer só te tira da torre, sem perder nada.</p>
    <p>Primeira vez em cada andar: <b>ouro triplo</b>. Guardiões vencidos pela primeira vez dão <b>pedras, item e gema</b>.</p>
    <div class="stat-cards"><div><small>Seu recorde</small><b>Andar ${best}</b></div><div><small>Monstros no próximo</small><b>Nv. ${towerMonLvl(best + 1)}</b></div></div>
    <div class="tower-btns"><button class="btn primary" data-tower="1" ${S.lvl < 10 ? 'disabled' : ''}>Começar do andar 1</button>
    ${st > 1 ? `<button class="btn primary" data-tower="top">Continuar do andar ${st}</button>` : ''}</div>
    ${S.lvl < 10 ? '<p class="muted">Abre no nível 10.</p>' : ''}</div>`;
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
  if (o.type === 'attack') { const m = aliveMons().find((x) => x.sid === o.sid); if (m) { R.mon = m; R.move = null; R.gather = null; } }
  if (o.type === 'gather' && R.nodes && R.nodes[o.id] && !R.dungeon) { if (R.nodes[o.id].cd > 0) { toast(`Volta em ${Math.ceil(R.nodes[o.id].cd)}s.`); return; } R.gather = { id: o.id, t: 0 }; R.mon = null; R.move = null; }
};


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
function hitMonster(m, mult, sk, d, forceCrit, src) {
  let dmg = rnd(d.atkMin, d.atkMax) * mult;
  const crit = forceCrit || Math.random() * 100 < d.crit;
  if (crit) dmg *= d.critMult + (forceCrit ? 0.5 : 0);
  if (m.type === 'undead') dmg *= 1 + d.undead + (sk && sk.holy ? 0.5 : 0);
  if (m.boss && sk && sk.boss) dmg *= 1 + sk.boss;
  if (sk && sk.type === 'aoe') dmg *= 1 + d.aoeMult; else if (sk && sk.type === 'dmg') dmg *= 1 + d.singleMult;
  dmg = Math.max(1, Math.round(dmg * 100 / (100 + m.def)));
  m.hp -= dmg; m.aggro = true;
  if (isMember()) R.coop.hits.set(m.sid, (R.coop.hits.get(m.sid) || 0) + dmg);
  meterHit(dmg, src || (sk ? sk.name : 'Ataque básico'));
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
  Scene.playerAttack({ text: hits[0].text, cls: hits[0].cls, crit: anyCrit, skill: !!sk, skillName, aoe: targets.length > 1 || (sk && sk.type === 'aoe'), hits, stealth, multi: sk && sk.hits, skillId: sk && sk.id, skillLv: sk && sk.lv });
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
  if (isMember() && !m.coopKill) { m.dead = true; m.hp = 0; R.mons = (R.mons || []).filter((x) => x.hp > 0); retarget(); return; } // o prêmio vem do líder
  m.dead = true; m.hp = 0;
  if (R.coop && R.coop.lead) Net.soc('crelay', { k: 'kill', d: { sid: m.sid, name: m.name, icon: m.icon, lvl: m.lvl, type: m.type, xp: m.xp, gold: m.gold, boss: m.boss, elite: m.elite } });
  if (m.coopKill) R.mons = (R.mons || []).filter((x) => x.sid !== m.sid);
  const d = derived();
  const lvlDiff = S.lvl - m.lvl;
  const xpMul = lvlDiff > 8 ? Math.max(0.1, 1 - (lvlDiff - 8) * 0.1) : 1; // penalidade por matar monstro muito fraco
  const sky = !R.dungeon ? worldSky(S.zone) : { night: 0, rain: false }, ev = eventNow();
  const xp = Math.round(m.xp * xpMul * (1 + d.xpb / 100) * (xpBoostOn() ? 1.5 : 1) * (sky.isNight ? 1.1 : 1) * (ev.id === 'xp' ? 1.5 : 1) * socialXp());
  S.best = S.best || {}; const bk = S.best[m.name] || 0; S.best[m.name] = bk + 1;
  if (BEST_TIERS.includes(bk + 1)) log(`📖 Bestiário: ${m.icon} ${esc(m.name)} chegou a ${bk + 1} derrotados! (+0,25% dano e XP)`, 'lvl');
  if (S.companion) { S.petXp = S.petXp || {}; const pl = petLevel(S.companion); S.petXp[S.companion] = (S.petXp[S.companion] || 0) + 1; if (petLevel(S.companion) > pl) log(`🐾 Seu mascote evoluiu para o nível ${petLevel(S.companion)}!`, 'lvl'); }
  { const M = meter(); M.kills++; M.xp += xp; }
  const gold = Math.round(m.gold * (1 + d.goldb / 100) * (sky.rain ? 1.1 : 1) * (ev.id === 'gold' ? 1.5 : 1));
  if (online() && Net.st.party && !R.coop) Net.shareKill(Math.round(xp * 0.15), Math.round(gold * 0.1));
  S.gold += gold; S.stats.goldEarned += gold; S.stats.kills++; meter().gold += gold;
  dailyProgress('kills'); dailyProgress('gold', gold); if (m.elite) dailyProgress('elites'); if (m.boss) dailyProgress('bosses');
  if (!m.tower) S.zoneKills[S.zone] = (S.zoneKills[S.zone] || 0) + 1;
  Sfx.play('kill'); Sfx.play('coin', { gap: 150 });
  log(`${m.icon} <b>${m.elite ? '⭐ ' : ''}${esc(m.name)}</b> derrotado! +${fmt(xp)} XP, +${fmt(gold)} ouro.`, m.boss ? 'boss' : '');
  if (m.boss) {
    if (m.wboss) worldBossReward(m);
    if (!m.tower && !m.wboss) { S.bosses[S.zone] = (S.bosses[S.zone] || 0) + 1; S.zoneKills[S.zone] = 0; }
    S.stats.bosses++;
    for (let i = 0; i < 2; i++) dropItem(genItem(m.lvl, 4));
    S.stones += rint(1, 3); dropGem(1, m.lvl); dropSoul(0.6, m.lvl, m.wboss ? 3 : 1);
    log(`👑 Chefe derrotado! Você recebeu Pedras de Refino.`, 'boss');
  } else if (m.roamer) {
    S.stats.elites = (S.stats.elites || 0) + 1; S.stats.roamers = (S.stats.roamers || 0) + 1;
    dropItem(genItem(m.lvl, 5)); S.stones += 2; dropGem(1, m.lvl); addMat('essencia', 2);
    log(`👣 <b>Errante derrotado!</b> +2 💎, um item raro, uma gema e 2 essências.`, 'boss'); toast('Errante derrotado!', 'good');
  } else if (m.elite) {
    S.stats.elites = (S.stats.elites || 0) + 1;
    log(`⭐ Monstro elite derrotado!`, 'boss');
    if (Math.random() < 0.6) dropItem(genItem(m.lvl, 3));
    if (Math.random() < 0.3) { S.stones++; log('💎 O elite deixou uma Pedra de Refino!', 'loot'); }
    dropGem(0.35, m.lvl); dropSoul(0.06, m.lvl);
    if (Math.random() < 0.25) { addMat('essencia', 1); log('✨ O elite deixou uma Essência!', 'loot'); }
  } else {
    if (Math.random() < 0.09) dropItem(genItem(m.lvl));
    dropGem(0.025, m.lvl); dropSoul(0.004, m.lvl);
    if (Math.random() < 0.012) { S.stones++; log('💎 Você encontrou uma Pedra de Refino!', 'loot'); }
  }
  gainXp(xp);
  questProgress(m);
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
  autoSkillPoints();
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
  const rev = classSkills().find((s) => s.type === 'passive' && s.revive && S.lvl >= s.lvl);
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
  R.tele = [];
  if (killer && killer.boss) { S.zoneKills[S.zone] = 0; R.mons = R.mons.filter((m) => !m.boss); log('O chefe venceu desta vez e voltou para as sombras. Derrote mais 25 monstros para desafiá-lo de novo.', 'muted'); }
  R.dead = 5;
  if (R.dungeon) exitDungeon(true);
  for (const m of aliveMons()) { m.aggro = false; m.returning = true; }
  R.mon = null; R.move = null; R.pet = null; R.stealth = 0;
  R.buffs = [];
  R.bossFight = false;
}

function trySkills(d) {
  const c = { skills: classSkills() };
  const ready = (s) => s.type !== 'passive' && S.lvl >= s.lvl && (R.cds[s.id] || 0) <= 0 && S.mp >= s.mp;
  // habilidade pedida pelo jogador tem prioridade
  if (R.forceSkill) {
    const fs = c.skills.find((x) => x.id === R.forceSkill); R.forceSkill = null;
    if (fs && ready(fs) && (fs.type === 'dmg' || fs.type === 'aoe')) return fs;
  }
  const avail = c.skills.filter((s) => ready(s) && !(S.skillOff || {})[s.id]);
  for (const s of avail.filter((s) => s.type !== 'dmg' && s.type !== 'aoe')) {
    if (useUtility(s, d, false)) { S.mp -= s.mp; R.cds[s.id] = s.cd; return null; }
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

function usePotionNow(kind) {
  if (!S || R.dead > 0) return;
  const d = derived();
  const ids = kind === 'hp' ? ['hp2', 'hp1'] : ['mp2', 'mp1'];
  const id = ids.find((x) => S.pots[x] > 0);
  if (!id) { toast('Sem poções. Compre com a Mercadora.', 'bad'); return; }
  if (R.potCd > 0) return;
  const p = SHOP.find((x) => x.id === id);
  if (kind === 'hp') { const h = Math.round(d.maxHp * p.heal); S.hp = Math.min(d.maxHp, S.hp + h); floatText('player', '+' + fmt(h), 'heal'); Scene.heal(); }
  else S.mp = Math.min(d.maxMp, S.mp + Math.round(d.maxMp * p.heal));
  S.pots[id]--; R.potCd = 1; Sfx.play('potion');
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
  R.evT = (R.evT || 0) - dt; if (R.evT <= 0) { R.evT = 1; eventTick(); }

  if (R.inTown) { // cidade: zona segura, recuperação rápida
    S.hp = Math.min(d.maxHp, S.hp + d.maxHp * 0.06 * dt);
    S.mp = Math.min(d.maxMp, S.mp + d.maxMp * 0.06 * dt);
    R.mon = null; R.dead = 0; R.bossFight = false; R.pet = null;
    return;
  }
  if (!R.dungeon && (R.worldZone !== S.zone || !R.pos)) initWorld();
  if (R.dead > 0) {
    R.dead -= dt;
    if (R.dead <= 0) { S.hp = d.maxHp; S.mp = d.maxMp; R.pos = { ...WORLD.entry }; log('Você renasceu na entrada do mapa.', 'muted'); }
    return;
  }
  if (R.coop && R.coop.lead && R.dungeon) coopLeaderTick(dt);
  if (R.dungeon) { if (!isMember()) dungeonTick(dt); }
  // população do mapa
  else if (R.mons.filter((m) => !m.boss).length < WORLD.cap) { R.spawnT -= dt; if (R.spawnT <= 0) { spawnWorldMonster(); R.spawnT = 3.5; } }
  if (!R.dungeon && (R.bossFight || (S.settings.autoBoss && (S.zoneKills[S.zone] || 0) >= 25 && S.lvl >= zoneById(S.zone).min + zoneSpan(zoneById(S.zone)) - 1 && !R.mons.some((m) => m.boss)))) { R.bossFight = false; spawnBoss(); }
  usePotions(d);
  if (S.hp <= 0) return;
  if (isMember()) coopMemberTick(dt);
  else { monstersAI(dt); resolveTelegraphs(dt); }
  if (R.dead > 0 || S.hp <= 0) return;
  // invocação
  if (R.pet) {
    R.pet.t -= dt; R.pet.timer -= dt;
    if (R.pet.timer <= 0 && R.mon && dist2(R.mon, R.pos) < 9) {
      R.pet.timer = R.pet.kind === 'falcao' ? 0.8 : 1.1;
      const r = hitMonster(R.mon, R.pet.mult, null, d, false, R.pet.name);
      Scene.petAttack({ sid: R.mon.sid, text: fmt(r.dmg) + (r.crit ? '!' : ''), cls: r.crit ? 'crit' : 'pet' });
      if (R.mon.hp <= 0) killMonster(R.mon);
    }
    if (R.pet && R.pet.t <= 0) { log(`${R.pet.icon} ${R.pet.name} desapareceu.`, 'muted'); R.pet = null; }
  }
  playerAI(dt, d);
}

function playerAI(dt, d) {
  retarget();
  const traveling = !R.mon || dist2(R.pos, R.mon) > weaponRange() + 2;
  const speed = 4.4 * (1 + Math.min(0.5, d.aps / 4 - 0.25)) * (traveling ? 1 + mountSpeed() : 1);
  R.mounted = !!S.mount && traveling;
  R.moving = false;
  autoDodge();
  if (R.nodes && !R.dungeon) for (const nd of R.nodes) if (nd.cd > 0) nd.cd -= dt;
  if (R.move) {
    R.gather = null; R.gathering = false;
    if (stepTo(R.pos, R.move, speed * dt)) R.move = null;
    if (!R.dungeon) { const ex = nearExit(1.8); if (ex) { walkZone(ex); return; } }
    R.moving = true; R.face = R.move ? Math.atan2(R.move.z - R.pos.z, R.move.x - R.pos.x) : R.face;
    return;
  }
  if (!R.dungeon && travelStep(dt, speed)) return;
  if (!R.dungeon && gatherStep(dt, speed)) return;
  if (!R.mon && S.settings.auto) { // no modo manual o herói só ataca o que o jogador tocar
    const attackers = aliveMons().filter((m) => m.aggro && !m.returning);
    const pool = attackers.length ? attackers : aliveMons().filter((m) => (!m.boss || (m.wboss && S.lvl >= m.lvl - 6)));
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
    if (sk) { S.mp -= sk.mp; R.cds[sk.id] = sk.cd; playerHit(sk.mult, sk); dailyProgress('skills'); }
    else playerHit(1);
  }
}

// ataques do chefe marcados no chão, fúria e reforços
function bossMechanics(m, dt) {
  if (!m.enraged && m.hp < m.maxHp * 0.3) {
    m.enraged = true; m.atk = Math.round(m.atk * 1.18);
    log(`💢 <b>${esc(m.name)}</b> entrou em fúria!`, 'boss'); Sfx.play('boss'); Scene.bossRage && Scene.bossRage(m.sid);
  }
  if (!m.summoned && m.hp < m.maxHp * 0.5) {
    m.summoned = true;
    const z = zoneById(S.zone);
    for (let i = 0; i < 1; i++) { const a = Math.random() * 6.28; const add = makeMonster(z.monsters[i][0], z.monsters[i][1], z.min + zoneSpan(z), false, 2); Object.assign(add, { x: m.x + Math.cos(a) * 2.5, z: m.z + Math.sin(a) * 2.5, home: { ...m.home }, aggro: true, wait: 0 }); R.mons.push(add); }
    log(`👥 ${esc(m.name)} chamou reforços!`, 'boss');
  }
  m.skillT = (m.skillT == null ? 4 : m.skillT) - dt;
  if (m.skillT <= 0) {
    m.skillT = m.enraged ? 4.5 : 7;
    const slam = Math.random() < 0.6;
    const t = { id: uid(), kind: slam ? 'slam' : 'nova', x: slam ? R.pos.x : m.x, z: slam ? R.pos.z : m.z, r: slam ? 2.6 : 4.8, t: slam ? 1.4 : 1.7, dmg: Math.round(m.atk * (slam ? 1.5 : 1.25)), src: m.sid };
    t.max = t.t;
    R.tele.push(t);
    log(`⚠️ ${esc(m.name)} prepara um ${slam ? 'golpe esmagador' : 'ataque em área'}! Saia da marca vermelha!`, 'boss');
  }
}
function resolveTelegraphs(dt) {
  if (!R.tele || !R.tele.length) return;
  const d = derived();
  for (const t of R.tele) {
    t.t -= dt;
    if (t.t <= 0 && !t.done) {
      t.done = true;
      Scene.teleBoom && Scene.teleBoom(t);
      if (R.dead > 0 || !R.pos) continue;
      if (dist2(R.pos, t) <= t.r) {
        let dmg = Math.max(1, Math.round(t.dmg * 150 / (150 + d.def) * (1 - d.absorb)));
        if (d.mshield > 0 && S.mp > 0) { const toMp = Math.min(S.mp, Math.round(dmg * d.mshield)); S.mp -= toMp; dmg -= toMp; }
        S.hp -= dmg; floatText('player', '-' + fmt(dmg), 'hurt'); Sfx.play('boom');
        if (S.hp <= 0) die(aliveMons().find((m) => m.sid === t.src));
      } else floatText('player', 'Desviou!', 'miss');
    }
  }
  R.tele = R.tele.filter((t) => !t.done);
}
// no modo Auto o herói sai sozinho das marcas no chão
function autoDodge() {
  if (!S.settings.auto || !R.tele || !R.tele.length || !R.pos) return false;
  const t = R.tele.find((x) => !x.done && dist2(R.pos, x) < x.r + 0.4);
  if (!t) return false;
  let dx = R.pos.x - t.x, dz = R.pos.z - t.z, dd = Math.hypot(dx, dz);
  if (dd < 0.01) { dx = 1; dz = 0; dd = 1; }
  R.move = { x: t.x + dx / dd * (t.r + 1.2), z: t.z + dz / dd * (t.r + 1.2) };
  return true;
}

function monstersAI(dt) {
  const live = aliveMons();
  for (const m of live) {
    m.moving = false;
    if (m.stun > 0) { m.stun -= dt; continue; }
    if (m.slow > 0) m.slow -= dt;
    const sp = m.slow > 0 ? 0.5 : 1, dp = dist2(m, R.pos);
    if (!m.aggro && !m.returning && dp < (m.dun ? 9 : m.boss ? 9 : 5) && !(R.stealth > 0)) {
      m.aggro = true;
      for (const o of live) if (!o.aggro && !o.boss && o !== m && o.name === m.name && dist2(o, m) < 4.5) o.aggro = true; // matilha
    }
    if (m.boss && m.aggro) bossMechanics(m, dt);
    if (m.aggro) {
      if ((!m.dun && dist2(m, m.home) > (m.boss ? 26 : 17)) || (R.stealth > 0 && dp > 3)) { m.aggro = false; m.returning = true; if (R.mon === m && !S.settings.auto) R.mon = null; continue; }
      const reach = m.boss ? 2.1 : 1.35;
      m.face = Math.atan2(R.pos.z - m.z, R.pos.x - m.x);
      if (dp > reach) { stepTo(m, R.pos, (m.boss ? 2.6 : 3.0) * sp * dt, reach * 0.9); m.moving = true; }
      else {
        m.timer -= dt * sp;
        if (m.timer <= 0) { m.timer = (m.boss ? (m.enraged ? 0.75 : 1.1) : 1.3) + Math.random() * 0.3; monsterHit(m); if (R.dead > 0 || S.hp <= 0) return; }
      }
    } else if (m.returning) {
      m.face = Math.atan2(m.home.z - m.z, m.home.x - m.x);
      if (stepTo(m, m.home, 4 * dt)) { m.returning = false; if (!m.boss) m.hp = m.maxHp; }
      m.moving = true;
    } else {
      // passeia perto do acampamento (o errante cruza o mapa inteiro)
      m.wait -= dt;
      if (m.roamer) {
        if (!m.wp && m.wait <= 0) { const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 20; m.wp = { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.8 }; }
        if (m.wp) { m.face = Math.atan2(m.wp.z - m.z, m.wp.x - m.x); m.moving = true; if (stepTo(m, m.wp, 1.6 * dt)) { m.wp = null; m.wait = 1 + Math.random() * 2; } m.home = { x: m.x, z: m.z }; }
        continue;
      }
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
function renderAccount() {
  const el = document.getElementById('acct'); if (!el) return;
  if (typeof Net === 'undefined' || !Net.st.available) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  if (Net.isOnline()) {
    const hasLocal = [0, 1, 2].some((i) => loadLocal(i));
    el.innerHTML = `<div class="acct-on">🌐 Conectado como <b>${esc(Net.st.user)}</b> · heróis salvos na nuvem
      ${hasLocal ? '<button class="btn small" data-act="acct-import">Enviar heróis deste aparelho</button>' : ''}
      <button class="btn small" data-act="acct-logout">Sair</button></div>`;
  } else {
    el.innerHTML = `<div class="acct-form"><b>🌐 Jogar online</b><span class="muted">Crie uma conta para salvar na nuvem, ver outros jogadores e entrar no ranking.</span>
      <input id="acct-user" maxlength="16" placeholder="Usuário" autocomplete="username">
      <input id="acct-pass" type="password" maxlength="64" placeholder="Senha (mín. 6)" autocomplete="current-password">
      <div class="row-btns"><button class="btn primary" data-act="acct-login">Entrar</button><button class="btn" data-act="acct-register">Criar conta</button></div>
      <small class="muted">Sem conta, seus heróis ficam só neste aparelho.</small></div>`;
  }
}
async function accountAction(kind) {
  try {
    if (kind === 'logout') { Net.logout(); renderSelect(); return; }
    if (kind === 'import') {
      let n = 0;
      for (let i = 0; i < 3; i++) { const c = loadLocal(i); if (c && !Net.st.slots[i]) { await Net.setSlot(i, c); n++; } }
      toast(n ? `${n} herói(s) enviado(s) para a conta.` : 'Os espaços da conta já estão ocupados.', n ? 'good' : 'bad'); renderSelect(); return;
    }
    const u = document.getElementById('acct-user').value.trim(), pw = document.getElementById('acct-pass').value;
    await Net.login(u, pw, kind === 'register');
    toast(kind === 'register' ? 'Conta criada! Bem-vindo(a).' : 'Conectado!', 'good');
    renderSelect();
  } catch (e) { toast(e.message, 'bad'); }
}

function renderSelect() {
  stopLoop();
  Scene.stop();
  if (typeof Net !== 'undefined') Net.disconnect();
  renderAccount();
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
  S.zone = 'z10'; S.tut = 99;
  S.skillLv = {}; for (const sk of CLASSES[cls].skills) S.skillLv[sk.id] = SKILL_MAX;
  const gemOrder = ['rubi', 'ametista', 'esmeralda', 'safira'];
  for (const sl of SLOT_ORDER) if (S.equip[sl]) S.equip[sl].gems = gemOrder.slice(0, sockets(S.equip[sl])).map((t) => ({ t, l: 5 }));
  S.owned = { mount2: true, pet2: true }; S.mount = 'mount2'; S.companion = 'pet2'; S.petXp = { pet2: 6000 };
  // artefatos (cruz completa com ressonância) e alma completa (quadrado latino: toda linha e coluna em Harmonia)
  S.arts = []; S.artCross = {};
  ['luvas', 'luvas', 'arma', 'armadura', 'luvas'].forEach((sl, k) => { const a = { uid: uid(), name: (sl === 'arma' ? 'Relíquia' : ARMOR_SLOTS[sl].names[5]) + ' Consagrada', slot: sl, rarity: 'lendario', ilvl: 100, set: null, wtype: null }; S.arts.push(a); S.artCross[ART_SPOTS[k]] = a.uid; });
  { const ts = Object.keys(SOUL); S.soul = { grid: Array.from({ length: 25 }, (_, i) => ({ t: ts[(Math.floor(i / 5) + i % 5) % 5], l: 5 })), bag: {} }; soulState(); for (const t of ts) S.soul.bag[t] = [6, 3, 1, 0, 0]; }
  S.spec = SPECS[cls][cls === 'engenheiro' ? 0 : 0].id;
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
  chars.forEach((c, i) => { if (!writeSlot(i, c)) okSave = false; });
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
  S.skillOff = S.skillOff || {}; S.skillLv = S.skillLv || {}; S.stats.elites = S.stats.elites || 0;
  if (!S.settings.quality) S.settings.quality = matchMedia('(max-width: 760px)').matches ? 'media' : 'alta';
  // migração: lança virou foice
  for (const it of [...Object.values(S.equip), ...S.inv]) if (it && it.wtype === 'lanca') { it.wtype = 'foice'; it.name = WEAPON_NAMES.foice[clamp(Math.floor(it.ilvl / 17), 0, 5)]; }
  S.settings = { autoHp: 50, autoMp: 30, autoSell: 'nenhum', autoBoss: false, autoBuyPots: true, autoPts: false, autoSkill: true, autoQuest: true, auto: true, autoAlma: false, ...S.settings };
  if (!S.settings.almaV2) { S.settings.almaV2 = true; S.settings.autoAlma = false; } // a montagem automática passou a ser opcional (desligada)
  R = { tele: [], mon: null, mons: [], pos: null, move: null, worldZone: null, face: 0, pet: null, stealth: 0, reviveCd: 0, log: [], cds: {}, buffs: [], respawn: 0.5, dead: 0, potCd: 0, bossFight: false, tab: 'mapas', sel: null, tradeSel: new Set(), tradeGold: 0, coop: null, dirty: { all: true } };
  const off = offlineProgress();
  const d = derived();
  S.hp = d.maxHp; S.mp = d.maxMp;
  showScreen('screen-game');
  Scene.start($('#scene'));
  if (online()) Net.connect();
  log(`Bem-vindo(a) de volta, <b>${esc(S.name)}</b>!`, 'lvl');
  const lg = checkLogin();
  if (off) showOffline(off);
  else if (lg) showLogin(lg);
  if (off && lg) R.pendingLogin = lg;
  renderAll();
  renderTut();
  startLoop();
}

function netState() {
  if (!online() || !Net.connected() || !R.pos && !R.inTown) return;
  const look = {};
  for (const sl of SLOT_ORDER) { const it = S.equip[sl]; if (it) look[sl] = { slot: sl, wtype: it.wtype, ilvl: it.ilvl, rarity: it.rarity, refine: it.refine || 0, set: it.set || null, req: 1 }; }
  Net.sendState({ name: S.name, cls: S.cls, lvl: S.lvl, rb: S.rebirths || 0, title: S.title || '', zone: S.zone, town: !!R.inTown, dun: !!R.dungeon,
    x: R.inTown ? 0 : R.pos.x, z: R.inTown ? 1.4 : R.pos.z, face: R.face || 0, moving: !!R.moving, atk: !!(R.mon && !R.moving), look, hp: Math.max(0, S.hp) / derived().maxHp, coop: !!R.coop });
  renderPartyHud();
}

// ---------- masmorra em grupo: o líder simula os monstros; os colegas veem o mesmo andar e mandam os golpes ----------
const isMember = () => !!(R && R.coop && !R.coop.lead);
function canCoop() { const pt = online() && Net.st.party; return !!(pt && pt.leader === S.name && pt.members.length > 1); }
function coopScale() { const pt = online() && Net.st.party; return 1 + 0.6 * Math.max(0, (pt ? pt.members.length : 1) - 1); }
function startCoop(zid) {
  enterDungeon(zid); if (!R.dungeon) return;
  R.coop = { lead: true, syncT: 0 }; R.dungeon.coop = true;
  for (const m of R.mons) { m.maxHp = m.hp = Math.round(m.maxHp * coopScale()); }
  Net.soc('crelay', { k: 'start', d: { zone: zid } });
  log('👥 <b>Masmorra em grupo!</b> Seus colegas foram chamados. Os monstros ficam mais fortes com mais gente.', 'boss');
}
function joinCoop(zone, leader) {
  if (R.dead > 0 || R.dungeon) return;
  const z = zoneById(zone); if (!z) return;
  if (S.lvl < z.min - 5) { toast('Nível baixo demais para essa masmorra.', 'bad'); return; }
  if (R.npc) { R.npc = null; $('#modal').classList.add('hidden'); $('#modal-body').classList.remove('wide'); }
  closeWin && closeWin();
  R.inTown = false; S.zone = zone; R.dungeon = { zone, floor: 1, floors: 3, next: 0, coop: true }; R.worldZone = 'dun';
  R.mons = []; R.mon = null; R.move = null; R.tele = []; R.pos = { x: 1.5, z: 11 }; R.playerTimer = 0.3;
  R.coop = { lead: false, leader, seen: Date.now(), hits: new Map(), hitT: 0 };
  Sfx.play('portal'); log(`👥 Você entrou na masmorra em grupo de <b>${esc(leader)}</b> (${esc(z.name)}).`, 'boss');
  R.dirty.all = true;
}
function coopLeaderTick(dt) {
  R.coop.syncT -= dt; if (R.coop.syncT > 0) return; R.coop.syncT = 0.2;
  const r2 = (v) => Math.round((v || 0) * 100) / 100;
  Net.soc('crelay', { k: 'sync', d: { f: R.dungeon.floor, m: aliveMons().slice(0, 24).map((m) => ({ sid: m.sid, name: m.name, icon: m.icon, lvl: m.lvl, type: m.type, x: r2(m.x), z: r2(m.z), hp: m.hp, maxHp: m.maxHp, atk: m.atk, def: m.def,
    boss: m.boss ? 1 : 0, elite: m.elite ? 1 : 0, face: r2(m.face), mv: m.moving ? 1 : 0, ag: m.aggro ? 1 : 0, en: m.enraged ? 1 : 0 })) } });
}
function coopApplySync(d) {
  if (!isMember() || !R.dungeon) return;
  R.coop.seen = Date.now();
  if (d.f !== R.dungeon.floor) { R.dungeon.floor = d.f; R.pos = { x: 1.5, z: 11 }; R.mon = null; R.dirty.all = true; log(`🕳️ Andar ${d.f}/3.`, 'boss'); }
  const old = new Map(R.mons.map((m) => [m.sid, m])), out = [];
  for (const x of d.m || []) {
    const m = old.get(x.sid) || { sid: x.sid, name: x.name, icon: x.icon, lvl: x.lvl, type: x.type, timer: 1 + Math.random(), stun: 0, slow: 0, dun: true, xp: 0, gold: 0 };
    Object.assign(m, { x: x.x, z: x.z, hp: x.hp, maxHp: x.maxHp, atk: x.atk, def: x.def, boss: !!x.boss, elite: !!x.elite, face: x.face, moving: !!x.mv, aggro: !!x.ag, enraged: !!x.en, home: { x: x.x, z: x.z } });
    out.push(m);
  }
  R.mons = out; if (R.mon && !out.includes(R.mon)) R.mon = null;
}
function coopMemberTick(dt) {
  if (Date.now() - R.coop.seen > 8000) { log('👥 Sem contato com o líder do grupo.', 'muted'); exitDungeon(false); return; }
  R.coop.hitT -= dt;
  if (R.coop.hitT <= 0 && R.coop.hits.size) { R.coop.hitT = 0.2; Net.soc('crelay', { k: 'hit', d: { h: [...R.coop.hits] } }); R.coop.hits.clear(); }
  for (const m of aliveMons()) { // monstros perto de você também atacam você
    if (m.stun > 0) { m.stun -= dt; continue; }
    if (dist2(m, R.pos) > (m.boss ? 2.4 : 1.7)) continue;
    m.timer -= dt; if (m.timer <= 0) { m.timer = (m.boss ? 1.1 : 1.3) + Math.random() * 0.3; monsterHit(m); if (R.dead > 0 || S.hp <= 0) return; }
  }
}
function onCoop(m) {
  const d = m.d || {};
  if (m.k === 'start') { if (!R.dungeon && !(R.dead > 0)) uiConfirm('Masmorra em grupo', `${m.from} abriu a masmorra de ${(zoneById(d.zone) || {}).name || ''}. Entrar junto?`, 'Entrar').then((y) => { if (y) joinCoop(d.zone, m.from); }); }
  else if (m.k === 'sync') coopApplySync(d);
  else if (m.k === 'hit' && R.coop && R.coop.lead) {
    for (const [sid, dmg] of (d.h || []).slice(0, 60)) { const mo = aliveMons().find((x) => x.sid === sid); if (mo) { mo.hp -= Math.max(0, Math.min(+dmg || 0, 1e9)); mo.aggro = true; if (mo.hp <= 0) killMonster(mo); } }
  } else if (m.k === 'kill' && isMember()) killMonster(Object.assign({}, d, { coopKill: true, hp: 0, dun: true }));
  else if (m.k === 'end' && isMember()) { if (d.done) dungeonReward(); R.coop = null; exitDungeon(false); }
  else if (m.k === 'leave' && R.coop && R.coop.lead) log(`👥 ${esc(m.from)} saiu da masmorra.`, 'muted');
}

// ---------- trocas entre jogadores ----------
function tradeSend() { const it = S.inv.filter((i) => R.tradeSel.has(i.uid)); Net.soc('toffer', { items: it, gold: Math.min(S.gold, R.tradeGold || 0) }); }
function tabTrade() {
  const tr = online() && Net.st.trade;
  if (!tr) return '<p class="muted">Nenhuma troca aberta. Peça uma troca na janela Social ou com /trocar Nome.</p>';
  const row = (i, act) => `<button class="tr-item" ${act}><span style="color:${rarityOf(i).color}">${esc(i.name)}</span> <small>Nv.${i.req || i.ilvl}${i.refine ? ' +' + i.refine : ''}</small></button>`;
  const offer = (o) => `${o.items.length ? o.items.map((i) => row(i, '')).join('') : '<p class="muted">Nada ainda.</p>'}<p>💰 ${fmt(o.gold)} ouro</p>`;
  const free = S.inv.filter((i) => !R.tradeSel.has(i.uid));
  return `<p>Trocando com <b>${esc(tr.with)}</b>. Mudou algo? Os dois precisam travar de novo.</p>
    <div class="tr-cols"><div><h4>Você dá ${tr.lockMe ? '🔒' : ''}${tr.okMe ? ' ✅' : ''}</h4>${tr.mine.items.map((i) => row(i, `data-trem="${i.uid}"`)).join('') || '<p class="muted">Toque nos itens abaixo para oferecer.</p>'}
      <p>💰 ${fmt(tr.mine.gold)} ouro oferecido</p><div class="row-btns"><input id="tr-gold" type="number" min="0" value="${R.tradeGold || 0}"><button class="btn small" data-tact="gold">Ouro</button></div></div>
      <div><h4>Você recebe ${tr.lockThem ? '🔒' : ''}${tr.okThem ? ' ✅' : ''}</h4>${offer(tr.theirs)}</div></div>
    <div class="row-btns"><button class="btn small" data-tact="cancel">Cancelar</button><button class="btn small" data-tact="lock" ${tr.lockMe ? 'disabled' : ''}>🔒 Travar</button><button class="btn small primary" data-tact="confirm" ${!(tr.lockMe && tr.lockThem) || tr.okMe ? 'disabled' : ''}>✅ Confirmar troca</button></div>
    <h4>Sua mochila</h4><div class="tr-inv">${free.map((i) => row(i, `data-toff="${i.uid}"`)).join('') || '<p class="muted">Mochila vazia.</p>'}</div>`;
}
function tradeAction(a) {
  if (a === 'cancel') Net.soc('tcancel');
  else if (a === 'lock') Net.soc('tlock');
  else if (a === 'confirm') Net.soc('tconfirm');
  else if (a === 'gold') { R.tradeGold = Math.max(0, Math.min(S.gold, Math.floor(+($('#tr-gold') || {}).value || 0))); tradeSend(); }
}
function tradeDone(m) {
  const giveIds = new Set(m.give.items.map((i) => i.uid));
  S.inv = S.inv.filter((i) => !giveIds.has(i.uid));
  S.gold = Math.max(0, S.gold - m.give.gold) + m.get.gold;
  for (const it of m.get.items) { const n = { ...it, uid: uid() }; if (S.inv.length < 40) S.inv.push(n); else S.gold += itemValue(n); }
  R.tradeSel = new Set(); R.tradeGold = 0; S.stats.trades = (S.stats.trades || 0) + 1;
  log(`🤝 Troca com <b>${esc(m.with)}</b> concluída: você recebeu ${m.get.items.length} item(ns) e ${fmt(m.get.gold)} ouro.`, 'loot'); toast('Troca concluída!', 'good');
  save(); R.dirty.inv = true; if (R.win === 'troca') closeWin();
}

// ---------- grupo e guilda (precisam do servidor) ----------
const GUILD_COST = 50000;
function partyNear() { const pt = online() && Net.st.party; return pt ? pt.members.filter((m) => m.name !== S.name && m.zone === S.zone && !m.town && !m.dun).length : 0; }
function guildBonus() { const g = online() && Net.st.guild; if (!g) return 0; const on = Math.max(Net.st.gOn || 0, g.members.filter((m) => m.online).length); return Math.min(0.1, Math.max(0, on - 1) * 0.02); }
function socialXp() { return (1 + partyNear() * 0.1) * (1 + guildBonus()); }
function renderPartyHud() {
  let el = document.getElementById('party-hud');
  const pt = online() && Net.st.party;
  if (!pt) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'party-hud'; el.className = 'party-hud'; const st = document.getElementById('stage'); if (!st) return; st.appendChild(el); }
  el.innerHTML = `<div class="ph-title">👥 Grupo${partyNear() ? ` · +${partyNear() * 10}% XP` : ''}</div>` + pt.members.filter((m) => m.name !== S.name).map((m) => {
    const far = m.zone !== S.zone || m.town || m.dun;
    return `<div class="ph-row${far ? ' far' : ''}"><b>${esc(m.name)}</b> <small>Nv.${m.lvl}${m.name === pt.leader ? ' 👑' : ''}${far ? ' · ' + (m.town ? 'cidade' : m.dun ? 'masmorra' : esc((zoneById(m.zone) || {}).name || '')) : ''}</small><i style="--w:${Math.round((m.hp || 0) * 100)}%"></i></div>`;
  }).join('');
}
function tabSocial() {
  if (!online()) return '<p class="muted">Grupos e guildas precisam do servidor. Entre com sua conta na tela de heróis (no servidor próprio do jogo).</p>';
  const pt = Net.st.party, g = Net.st.guild, others = [...Net.st.others.values()];
  const near = others.length ? others.map((o) => `<div class="soc-row"><b>${esc(o.name)}</b> <small>Nv.${o.lvl} ${esc(CLASSES[o.cls] ? CLASSES[o.cls].name : '')}</small><span><button class="btn small" data-pinv="${esc(o.name)}">+ Grupo</button><button class="btn small" data-tinv="${esc(o.name)}">🤝 Trocar</button>${g ? `<button class="btn small" data-ginv="${esc(o.name)}">+ Guilda</button>` : ''}</span></div>`).join('') : '<p class="muted">Ninguém neste mapa agora.</p>';
  const party = pt ? `<div class="soc-list">${pt.members.map((m) => `<div class="soc-row"><b>${esc(m.name)}${m.name === pt.leader ? ' 👑' : ''}</b> <small>Nv.${m.lvl} · ${m.town ? 'cidade' : m.dun ? 'masmorra' : esc((zoneById(m.zone) || {}).name || '')}</small></div>`).join('')}</div>
    <p class="muted">+10% de XP por colega no mesmo mapa. Quem está junto ganha 15% do XP e 10% do ouro dos seus abates.</p><button class="btn small" data-soc="pleave">Sair do grupo</button>`
    : '<p class="muted">Você não está em grupo. Convide alguém abaixo ou pelo chat: /convidar Nome</p>';
  const guild = g ? `<div class="guild-head"><b>🛡️ ${esc(g.name)}</b> <small>Líder: ${esc(g.owner)} · ${g.members.filter((m) => m.online).length}/${g.members.length} online · bônus +${Math.round(guildBonus() * 100)}% XP</small></div>
    <div class="soc-list">${g.members.sort((a, b) => b.online - a.online || b.lvl - a.lvl).map((m) => `<div class="soc-row${m.online ? '' : ' off'}"><b>${m.online ? '🟢' : '⚪'} ${esc(m.name)}${m.owner ? ' 👑' : ''}</b> <small>Nv.${m.lvl || '?'} · conta ${esc(m.user)}</small>${g.owner === Net.st.user && !m.owner ? `<button class="btn small" data-gkick="${esc(m.key)}">Expulsar</button>` : ''}</div>`).join('')}</div>
    <p class="muted">Chat da guilda: /g mensagem · cada membro online dá +2% de XP (até 10%).</p><button class="btn small" data-soc="gleave">Sair da guilda</button>`
    : `<p class="muted">Funde uma guilda (nível 20, ${fmt(GUILD_COST)} ouro) ou aceite um convite.</p><div class="row-btns"><input id="guild-name" maxlength="20" placeholder="Nome da guilda"><button class="btn small primary" data-soc="gcreate" ${S.lvl < 20 || S.gold < GUILD_COST ? 'disabled' : ''}>Fundar</button></div>`;
  return `<h3 class="soc-h">👥 Grupo</h3>${party}<h3 class="soc-h">🛡️ Guilda</h3>${guild}<h3 class="soc-h">🧭 Jogadores neste mapa</h3>${near}`;
}
function socialAction(a) {
  if (a === 'pleave') Net.soc('pleave');
  else if (a === 'gleave') uiConfirm('Sair da guilda', 'Tem certeza que quer sair da guilda?', 'Sair').then((y) => { if (y) Net.soc('gleave'); });
  else if (a === 'gcreate') { const n = ($('#guild-name') || {}).value || ''; if (S.gold < GUILD_COST) return toast('Ouro insuficiente.', 'bad'); Net.soc('gcreate', { name: n.trim() }); }
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
    if ((R.netT = (R.netT || 0) + 1) % 2 === 0) netState();
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

// ---------- minimapa ----------
function drawMinimap() {
  const cv = document.getElementById('minimap'); if (!cv || !S) return;
  const g = cv.getContext('2d'), W = cv.width, C = W / 2;
  g.clearRect(0, 0, W, W);
  const th = (Scene2D.THEMES && Scene2D.THEMES[R.inTown ? 'town_' + CLASSES[S.cls].faction : S.zone]) || { g: ['#4a6a3a', '#2a3a20'] };
  const bg = g.createRadialGradient(C, C, 10, C, C, C); bg.addColorStop(0, th.g[0]); bg.addColorStop(1, th.g[1]);
  g.fillStyle = bg; g.fillRect(0, 0, W, W);
  const k = (C - 6) / 36, P = (x, z) => [C + x * k, C + z * k];
  const dot = (x, z, r, col, stroke) => { const [px, py] = P(x, z); g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fillStyle = col; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); } };
  let label = '';
  if (R.inTown) {
    label = cityName();
    const npc = { guarda: [-1.3, 0.6], mercador: [-3.5, -0.3], ferreiro: [-2.1, -3.3], portal: [2.1, -3.3], mestra: [3.5, -0.3], bau: [1.3, 0.5] };
    const kt = (C - 10) / 7, PT = (x, z) => [C + x * kt, C + (z + 1.4) * kt];
    g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.arc(C, C, 5.2 * kt, 0, Math.PI * 2); g.fill();
    g.font = '13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const ic = { guarda: '⚔️', mercador: '🛒', ferreiro: '🔨', portal: '🌀', mestra: '📜', bau: '🧰' };
    for (const id in npc) { const [px, py] = PT(npc[id][0], npc[id][1]); g.fillText(ic[id], px, py); }
    const [hx, hy] = PT(0, 1.4); g.beginPath(); g.arc(hx, hy, 4, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  } else {
    label = R.dungeon ? (R.dungeon.tower ? `Torre ${R.dungeon.floor}` : `Masmorra ${R.dungeon.floor}/3`) : zoneById(S.zone).name;
    if (R.dungeon) { g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.beginPath(); g.arc(C, C, 16 * k, 0, Math.PI * 2); g.stroke(); }
    if (!R.dungeon) for (const c of zoneCamps(S.zone)) dot(c.x, c.z, 4, 'rgba(120,80,40,.6)');
    if (!R.dungeon) { const [ax, ay] = P(WORLD.arena.x, WORLD.arena.z); g.beginPath(); g.arc(ax, ay, 6 * k, 0, Math.PI * 2); g.strokeStyle = '#b060ff'; g.lineWidth = 2; g.stroke(); }
    if (!R.dungeon) dot(WORLD.entry.x, WORLD.entry.z, 3.5, '#60e080', '#000');
    if (!R.dungeon) for (const ex of zoneExits(S.zone)) { const [ex0, ey0] = P(ex.x, ex.z); g.fillStyle = exitLocked(ex) ? '#888' : '#60c0ff'; g.font = "bold 13px sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ex.side === 'next' ? '▶' : ex.side === 'branch' ? '▼' : '◀', ex0, ey0); }
    if (!R.dungeon && R.nodes) for (const nd of R.nodes) if (nd.cd <= 0) dot(nd.x, nd.z, 2.4, nd.type === 'essencia' ? '#60e0ff' : nd.type === 'erva' ? '#70e060' : '#c0b0a0', '#000');
    for (const m of aliveMons()) dot(m.x, m.z, m.boss ? 5 : m.elite ? 3.6 : 2.6, m.boss ? '#c070ff' : m.elite ? '#ffd040' : m.aggro ? '#ff4040' : '#ffaa40', '#000');
    if (R.move) dot(R.move.x, R.move.z, 2, '#80ff9a');
    if (R.pos) {
      const [px, py] = P(R.pos.x, R.pos.z), f = R.face || 0;
      g.save(); g.translate(px, py); g.rotate(f); g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, 4); g.lineTo(-2, 0); g.lineTo(-4, -4); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#000'; g.stroke(); g.restore();
    }
  }
  if (online() && Net.connected()) label += ` · 🌐 ${Net.st.online}`;
  const lb = document.getElementById('mm-label'); if (lb && lb.textContent !== label) lb.textContent = label;
}

function renderHeader() {
  const c = CLASSES[S.cls];
  $('#p-name').innerHTML = `${esc(S.name)}${S.title ? ` <small class="p-title">« ${esc(S.title)} »</small>` : ''}`;
  $('#hdr-name').innerHTML = `${c.icon} ${esc(S.name)} <span class="muted">· ${c.name} · ${FACTIONS[c.faction].name}</span>`;
}

function renderLive() {
  const d = derived();
  $('#hdr-lvl').textContent = (S.rebirths ? '★' + S.rebirths + ' ' : '') + 'Nv. ' + S.lvl;
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
  if (R.dungeon && R.dungeon.tower) $('#zone-title').innerHTML = `🗼 Torre Infinita <span class="muted">(andar ${R.dungeon.floor} · recorde ${S.towerBest || 0})</span>`;
  else if (R.dungeon) $('#zone-title').innerHTML = `🕳️ Masmorra: ${z.name} <span class="muted">(andar ${R.dungeon.floor}/${R.dungeon.floors})</span>`;
  else if (!R.inTown) { const w = worldSky(S.zone), ev = eventNow();
    $('#zone-title').innerHTML = `${z.icon} ${z.name} <span class="muted">(Nv. ${z.min}+)</span> <span class="sky-ico" title="${w.isNight ? 'Noite: +10% XP' : 'Dia'}${w.rain ? ' · Chuva: +10% ouro' : ''}">${w.rain ? '🌧️' : w.isNight ? '🌙' : '☀️'}</span>${ev.id ? ` <span class="ev-tag" title="${esc(ev.desc)}">${ev.icon} <span class="ev-name">${ev.name} </span>${Math.ceil(ev.left / 60000)}min</span>` : ''}`; }
  $('#boss-btn').classList.toggle('hidden', !!R.inTown || !!R.dungeon);
  $('#mute-btn').textContent = S.settings.muted ? '🔇' : '🔊';
  { const bb = $('#boss-bar'), bs = !R.inTown && aliveMons().find((m) => m.boss && (m.aggro || (R.pos && dist2(m, R.pos) < 22)));
    bb.classList.toggle('hidden', !bs);
    if (bs) bb.innerHTML = `<div class="bb-name">👑 ${esc(bs.name)} <small>Nv. ${bs.lvl}</small>${bs.enraged ? ' <span class="bb-rage">FÚRIA</span>' : ''}</div><div class="bb-bar"><i style="width:${Math.max(0, bs.hp / bs.maxHp * 100)}%"></i><span>${fmt(Math.max(0, bs.hp))} / ${fmt(bs.maxHp)}</span></div>`; }
  $('#pot-hp').textContent = (S.pots.hp1 || 0) + (S.pots.hp2 || 0);
  $('#pot-mp').textContent = (S.pots.mp1 || 0) + (S.pots.mp2 || 0);
  R.mmT = (R.mmT || 0) + 1; if (R.mmT % 2 === 0) drawMinimap(); if (R.mmT % 10 === 0) renderQuestTrack(); if (R.mmT % 5 === 0) tutTick(); if (R.mmT % 50 === 0) checkAch();
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
    ${S.lvl >= MAX_LEVEL ? `<button class="btn primary rebirth-btn" data-act="rebirth">🌟 Renascer (${(S.rebirths || 0) + 1}º)</button>` : ''}
    ${S.rebirths ? `<p class="muted">Renascimentos: <b>${S.rebirths}</b> · +${S.rebirths * 10}% ataque, XP e ouro · +${S.rebirths * 5}% vida</p>` : ''}
    ${Object.entries(setCounts()).map(([id, n]) => `<p class="set-mini" style="--sc:${SETS[id].color}">◆ ${SETS[id].name}: ${n}/4 ${n >= 2 ? '(2 peças ativo)' : ''}${n >= 4 ? ' (4 peças ativo)' : ''}</p>`).join('')}
    ${specOf() ? `<p class="set-mini" style="--sc:#ffd060">${specOf().icon} Especialização: ${specOf().name}</p>` : (S.lvl >= SPEC_LVL ? '<p class="good">✨ Escolha sua especialização na janela Skills!</p>' : '')}
    <div class="row-btns"><button class="btn small" data-win="stats">📊 Estatísticas</button><button class="btn small" data-win="bestiario">📖 Bestiário</button></div>
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
  if (it.slot === 'arma') { const k = Object.keys(CLASSES).find((c) => CLASSES[c].weapon === it.wtype); return k ? CLASSES[k].icon : '⚔️'; }
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
  if (it.set) { const st = SETS[it.set], n = setCounts()[it.set] || 0; h += `<div class="set-info" style="--sc:${st.color}"><b>Conjunto ${st.name}</b> (${n}/4 equipadas)<br><span class="${n >= 2 ? 'on' : ''}">2 peças: ${st.d2}</span><br><span class="${n >= 4 ? 'on' : ''}">4 peças: ${st.d4}</span></div>`; }
  if (S.lvl < it.req) h += `<div class="bad">Inativo até o nível ${it.req}</div>`;
  if (sockets(it)) h += `<div class="affix">Encaixes: ${(it.gems || []).map((g) => `${GEMS[g.t].icon}+${GEMS[g.t].per * g.l}${GEMS[g.t].label}`).join(' ') || ''} ${'◇'.repeat(sockets(it) - (it.gems || []).length)}</div>`;
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
  $('#skill-bar').innerHTML = classSkills().map((s, i) => {
    const locked = S.lvl < s.lvl, off = S.skillOff[s.id], pas = s.type === 'passive';
    return `<div class="skill ${locked ? 'locked' : ''} ${off ? 'off' : ''}" id="sk-${s.id}" data-cast="${s.id}" title="${esc(s.name)} — ${skillDesc(s)}${locked ? ' (Nv. ' + s.lvl + ')' : ''}">
      <div class="cd"></div><kbd>${i + 1}</kbd>${!locked && s.lv > 1 ? `<i class="sk-lv">${s.lv}</i>` : ''}<span>${esc(s.name)}</span>${locked ? `<em>Nv.${s.lvl}</em>` : ''}${!locked && !pas ? `<b class="auto-dot" data-skill="${s.id}" title="Uso automático">A</b>` : ''}</div>`;
  }).join('');
}

// usa uma habilidade agora (toque na barra ou teclas 1–6)
function castSkill(id) {
  const sk = classSkills().find((x) => x.id === id);
  if (!sk || S.lvl < sk.lvl || sk.type === 'passive' || R.dead > 0 || R.inTown) return;
  if ((R.cds[sk.id] || 0) > 0) { toast(`${sk.name}: recarregando (${Math.ceil(R.cds[sk.id])}s)`); return; }
  if (S.mp < sk.mp) { toast('Mana insuficiente.', 'bad'); return; }
  const d = derived();
  if (sk.type === 'dmg' || sk.type === 'aoe') {
    if (!R.mon) { const m = aliveMons().sort((a, b) => dist2(a, R.pos) - dist2(b, R.pos))[0]; if (m && dist2(m, R.pos) < 14) R.mon = m; }
    if (!R.mon) { toast('Nenhum alvo por perto.'); return; }
    R.forceSkill = sk.id; R.move = null;
    if (dist2(R.pos, R.mon) <= weaponRange() + (R.mon.boss ? 0.8 : 0)) R.playerTimer = 0;
  } else if (useUtility(sk, d, true)) { S.mp -= sk.mp; R.cds[sk.id] = sk.cd; }
  const el = document.getElementById('sk-' + id); if (el) { el.classList.add('casted'); setTimeout(() => el.classList.remove('casted'), 300); }
}

// aplica cura, invocação, furtividade ou bônus; retorna true se usou
function useUtility(s, d, forced) {
  if (s.type === 'heal') {
    if (!forced && S.hp / d.maxHp >= 0.6) return false;
    const h = Math.round(d.maxHp * s.mult * (1 + d.healMult));
    S.hp = Math.min(d.maxHp, S.hp + h);
    floatText('player', '+' + fmt(h), 'heal'); Scene.heal(s.id); Sfx.play('heal');
    log(`💚 ${esc(s.name)} restaurou ${fmt(h)} de vida.`, 'heal');
    return true;
  }
  if (s.type === 'summon') {
    if (R.pet && !forced) return false;
    const P = PETS[s.pet];
    R.pet = { kind: s.pet, name: P.name, icon: P.icon, t: s.dur, mult: s.mult * (1 + d.petMult), timer: 1, hp: Math.round(d.maxHp * (P.hp || 0)), maxHp: Math.round(d.maxHp * (P.hp || 0)), sid: uid() };
    log(`${P.icon} Você invocou <b>${P.name}</b>!`, 'skill'); Scene.buff(s.id); Sfx.play('portal');
    return true;
  }
  if (s.type === 'stealth') {
    if (R.stealth > 0 || (!forced && !R.mon)) return false;
    R.stealth = s.dur;
    log(`🌑 ${esc(s.name)}: você sumiu nas sombras.`, 'skill'); Scene.buff(s.id); Sfx.play('whiff');
    return true;
  }
  if (s.type === 'buff') {
    if (R.buffs.some((b) => b.id === s.id)) { if (!forced) return false; R.buffs = R.buffs.filter((b) => b.id !== s.id && b.id !== s.id + '+'); }
    R.buffs.push({ id: s.id, name: s.name, stat: s.stat, val: s.val, t: s.dur * (1 + d.buffDur) });
    if (s.also) R.buffs.push({ id: s.id + '+', name: '', stat: s.also.stat, val: s.also.val, t: s.dur, hidden: true });
    log(`✨ ${esc(s.name)} ativado.`, 'skill'); Scene.buff(s.id); Sfx.play('buff');
    return true;
  }
  return false;
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

const LOG_CAT = { '': 'combate', skill: 'combate', heal: 'combate', death: 'combate', loot: 'sistema', lvl: 'sistema', boss: 'sistema', muted: 'sistema', chat: 'chat' };
function renderLog() {
  const tab = R.chatTab || 'todos';
  const rows = R.log.filter((l) => tab === 'todos' || LOG_CAT[l.cls] === tab || (tab === 'sistema' && l.cls === 'chat')).slice(0, 50);
  $('#log').innerHTML = rows.map((l) => `<div class="log-line lg-${l.cls}">${l.msg}</div>`).join('');
}
function chatCommand(txt) {
  const t = txt.trim(); if (!t) return;
  if (!t.startsWith('/')) { if (!(online() && Net.chat(t, 'global'))) log(`<b style="color:#9ad0ff">[${esc(S.name)}]</b> ${esc(t)}`, 'chat'); return; }
  if (/^\/(p|grupo)\s/i.test(t)) { const msg = t.replace(/^\/\S+\s/, ''); if (!(online() && Net.chat(msg, 'party'))) log('Sem conexão com o servidor.', 'chat'); return; }
  if (/^\/(g|guilda)\s/i.test(t)) { const msg = t.replace(/^\/\S+\s/, ''); if (!(online() && Net.chat(msg, 'guild'))) log('Sem conexão com o servidor.', 'chat'); return; }
  if (/^\/trocar\s/i.test(t)) { if (!online()) { log('Sem conexão com o servidor.', 'chat'); return; } Net.soc('tinvite', { name: t.replace(/^\/\S+\s/, '').trim() }); return; }
  if (/^\/(convidar|ginvite|convidarguilda)\s/i.test(t)) { const [c0, ...nm] = t.slice(1).split(/\s+/); if (!online()) { log('Sem conexão com o servidor.', 'chat'); return; } Net.soc(/guilda|ginvite/i.test(c0) ? 'ginvite' : 'pinvite', { name: nm.join(' ') }); return; }
  if (/^\/z(ona)?\s/i.test(t)) { const msg = t.replace(/^\/\S+\s/, ''); if (!(online() && Net.chat(msg, 'zone'))) log('Sem conexão com o servidor.', 'chat'); return; }
  const [cmd, ...args] = t.slice(1).toLowerCase().split(/\s+/);
  const arg = args.join(' ');
  switch (cmd) {
    case 'sairgrupo': if (online()) Net.soc('pleave'); break;
    case 'ajuda': case 'help': log('Comandos: /z mensagem (chat do mapa), /p mensagem (grupo), /g mensagem (guilda), /convidar Nome, /convidarguilda Nome, /trocar Nome, /sairgrupo, /auto, /cidade, /cacar, /mapa [1-10], /chefe, /pos, /online, /limpar. Mensagem sem / vai para o chat geral.', 'chat'); break;
    case 'online': log(online() ? `🌐 ${Net.st.online} jogador(es) online · ${Net.st.others.size} neste mapa.` : 'Você está jogando offline.', 'chat'); break;
    case 'auto': S.settings.auto = !S.settings.auto; log(`Modo automático ${S.settings.auto ? 'ligado' : 'desligado'}.`, 'chat'); break;
    case 'cidade': setTown(true); break;
    case 'cacar': case 'caçar': setTown(false); break;
    case 'chefe': if ((S.zoneKills[S.zone] || 0) >= 25) R.bossFight = true; else log(`Faltam ${25 - (S.zoneKills[S.zone] || 0)} abates para desafiar o chefe.`, 'chat'); break;
    case 'pos': log(`Posição: ${R.pos ? R.pos.x.toFixed(0) + ', ' + R.pos.z.toFixed(0) : '-'} em ${zoneById(S.zone).name}.`, 'chat'); break;
    case 'limpar': R.log = []; break;
    case 'mapa': { const z = ZONES[(+arg || 0) - 1]; if (!z) { log('Use /mapa 1 a /mapa 10.', 'chat'); break; } if (S.lvl < z.min - 3) { log(`Nível ${z.min - 3} necessário.`, 'chat'); break; } S.zone = z.id; R.worldZone = null; if (R.inTown) setTown(false); log(`Viajando para ${z.name}.`, 'chat'); break; }
    default: log('Comando desconhecido. Digite /ajuda.', 'chat');
  }
  R.dirty.log = true; renderLog();
}

// ---------- 🏺 Artefatos: itens +10 consagrados; cruz de 5 (o centro dá o poder, os 4 de volta ampliam) ----------
const ART_POWER = { // poder de cada tipo de peça (valor por unidade de força)
  arma:     { k: 'crit',    label: 'de crítico',            per: 0.4,   fmt: (v) => v.toFixed(1) + '%' },
  armadura: { k: 'defp',    label: 'de defesa',             per: 1.2,   fmt: (v) => v.toFixed(0) + '%' },
  botas:    { k: 'spd',     label: 'de velocidade de ataque',    per: 0.008, fmt: (v) => '+' + (v * 100).toFixed(0) + '%' },
  elmo:     { k: 'hpp',     label: 'de vida',               per: 1.5,   fmt: (v) => v.toFixed(0) + '%' },
  luvas:    { k: 'atkp',    label: 'de ataque',             per: 1.2,   fmt: (v) => v.toFixed(0) + '%' },
  escudo:   { k: 'block',   label: 'de bloqueio',      per: 0.004, fmt: (v) => '+' + (v * 100).toFixed(1) + '%' },
  amuleto:  { k: 'critdmg', label: 'de dano crítico',            per: 0.02,  fmt: (v) => '+' + (v * 100).toFixed(0) + '%' },
  anel:     { k: 'absorb',  label: 'de dano recebido (resistência)', per: 0.003, fmt: (v) => '-' + (v * 100).toFixed(1) + '%' },
};
const ART_SPOTS = ['c', 'n', 'l', 'o', 's'], ART_MAX = 24;
function artForce(a) { return (1 + RARITIES.findIndex((r) => r.id === a.rarity) * 0.5) * (1 + a.ilvl / 50); }
function artAmp(a, c) { // quanto um artefato do lado amplia o centro
  let v = 0.1 + 0.04 * RARITIES.findIndex((r) => r.id === a.rarity);
  if (c && (a.slot === c.slot || (a.set && a.set === c.set))) v *= 1.5; // ressonância
  return v;
}
function artState() { S.arts = S.arts || []; S.artCross = S.artCross || {}; return S; }
function artAt(spot) { artState(); return S.arts.find((a) => a.uid === S.artCross[spot]) || null; }
function artTotal() { // { k, v, amp } do centro já ampliado
  const c = artAt('c'); if (!c) return null;
  let amp = 1; for (const sp of ART_SPOTS.slice(1)) { const a = artAt(sp); if (a) amp += artAmp(a, c); }
  const P = ART_POWER[c.slot]; return { k: P.k, v: artForce(c) * P.per * amp, amp, P };
}
function consecrate(uidv) {
  artState();
  const eqSlot = SLOT_ORDER.find((sl) => S.equip[sl] && S.equip[sl].uid === uidv);
  const it = eqSlot ? S.equip[eqSlot] : S.inv.find((i) => i.uid === uidv);
  if (!it || (it.refine || 0) < 10) { toast('Só itens +10 podem virar artefato.', 'bad'); return; }
  if (S.arts.length >= ART_MAX) { toast(`Limite de ${ART_MAX} artefatos.`, 'bad'); return; }
  uiConfirm('Consagrar item', `${it.name} +10 vai se transformar em artefato e sair da mochila. Continuar?`, 'Consagrar').then((y) => {
    if (!y) return;
    if (eqSlot) S.equip[eqSlot] = null; else S.inv = S.inv.filter((i) => i !== it);
    const slot = it.slot || 'arma';
    S.arts.push({ uid: uid(), name: it.name, slot, rarity: it.rarity, ilvl: it.ilvl, set: it.set || null, wtype: it.wtype || null });
    S.stats.arts = (S.stats.arts || 0) + 1; autoAlmaMaybe();
    log(`🏺 <b>${esc(it.name)}</b> virou artefato! Coloque na cruz da janela Alma.`, 'lvl'); Sfx.play('levelup'); toast('Artefato criado!', 'good');
    R.sel = null; R.refSel = null; R.dirty.all = true; R.win = null; R.almaTab = 'art'; openWin('alma');
  });
}
function artPlace(spot) {
  artState(); manualAlma();
  if (!R.artSel) { if (S.artCross[spot]) { delete S.artCross[spot]; renderTab(); } return; }
  for (const k of ART_SPOTS) if (S.artCross[k] === R.artSel) delete S.artCross[k];
  S.artCross[spot] = R.artSel; R.artSel = null; Sfx.play('click'); renderTab(); R.dirty.all = true;
}

// ---------- 🔮 Alma: grade 5×5 de pedras; linhas e colunas formam combinações ----------
const SOUL = {
  atk:  { name: 'Ataque',      icon: '⚔️', color: '#ff7050', k: 'atkp',   per: 1.5,   fmt: (v) => '+' + v.toFixed(1) + '% ataque' },
  crit: { name: 'Crítico',     icon: '💥', color: '#ffd040', k: 'crit',   per: 0.5,   fmt: (v) => '+' + v.toFixed(1) + '% crítico' },
  vit:  { name: 'Vitalidade',  icon: '❤️', color: '#ff5080', k: 'hpp',    per: 2,     fmt: (v) => '+' + v.toFixed(1) + '% vida' },
  def:  { name: 'Defesa',      icon: '🛡️', color: '#60a0ff', k: 'defp',   per: 2,     fmt: (v) => '+' + v.toFixed(1) + '% defesa' },
  res:  { name: 'Resistência', icon: '🌀', color: '#a070ff', k: 'absorb', per: 0.005, fmt: (v) => '-' + (v * 100).toFixed(1) + '% dano recebido' },
};
const SOUL_ORDER = [12, 7, 11, 13, 17, 6, 8, 16, 18, 2, 10, 14, 22, 1, 3, 5, 9, 15, 19, 21, 23, 0, 4, 20, 24]; // do centro para fora
function soulState() { S.soul = S.soul || { grid: Array(25).fill(null), bag: {} }; for (const t in SOUL) S.soul.bag[t] = S.soul.bag[t] || [0, 0, 0, 0, 0]; return S.soul; }
function soulOpen() { return Math.min(25, 9 + Math.floor(Math.max(0, S.lvl - 20) / 5)); }
const soulCellOpen = (i) => SOUL_ORDER.indexOf(i) < soulOpen();
function soulLines() { // 5 linhas + 5 colunas com o que formam
  const g = soulState().grid, out = [];
  for (let k = 0; k < 5; k++) for (const dir of ['row', 'col']) {
    const cells = [0, 1, 2, 3, 4].map((j) => g[dir === 'row' ? k * 5 + j : j * 5 + k]);
    if (cells.some((c) => !c)) continue;
    const types = new Set(cells.map((c) => c.t)), minL = Math.min(...cells.map((c) => c.l));
    if (types.size === 1) out.push({ dir, k, kind: 'same', t: cells[0].t, lvl: minL });
    else if (types.size === 5) out.push({ dir, k, kind: 'harm', lvl: minL });
  }
  return out;
}
function soulBonus() { // soma em chaves: atkp, crit, hpp, defp, absorb
  const B = {}, add = (k, v) => { B[k] = (B[k] || 0) + v; }, g = soulState().grid;
  for (const c of g) if (c) add(SOUL[c.t].k, SOUL[c.t].per * c.l);
  for (const L of soulLines()) {
    if (L.kind === 'same') add(SOUL[L.t].k, SOUL[L.t].per * 5 * L.lvl * 0.6); // linha igual: +60% da linha
    else for (const t in SOUL) add(SOUL[t].k, SOUL[t].per * L.lvl * 0.4); // harmonia: um pouco de tudo
  }
  if (g.every(Boolean)) for (const t in SOUL) add(SOUL[t].k, SOUL[t].per * 3); // grade completa
  return B;
}
function dropSoul(chance, lvl, n = 1) {
  if (Math.random() >= chance) return;
  const b = soulState().bag, ts = Object.keys(SOUL);
  for (let i = 0; i < n; i++) {
    const t = ts[rint(0, ts.length - 1)], l = Math.min(4, Math.floor(Math.random() * (1 + lvl / 45)));
    b[t][l]++;
    log(`🔮 Pedra da Alma: ${SOUL[t].icon} ${SOUL[t].name} nível ${l + 1}!`, 'loot');
  }
  Sfx.play('loot', { rarity: 3, gap: 100 }); R.dirty.inv = true;
  autoAlmaMaybe();
}
function manualAlma() { if (S.settings.autoAlma) { S.settings.autoAlma = false; log('🔮 Você está montando do seu jeito: "Remontar sozinho" foi desligado.', 'muted'); } }
function soulPlace(i) {
  const so = soulState(); manualAlma();
  if (!soulCellOpen(i)) { toast(`Abre com mais nível (até o nível 100 todas abrem).`); return; }
  const cur = so.grid[i];
  if (cur) { so.bag[cur.t][cur.l - 1]++; so.grid[i] = null; }
  if (R.soulSel && !(cur && cur.t === R.soulSel.t && cur.l === R.soulSel.l)) {
    const { t, l } = R.soulSel;
    if (so.bag[t][l - 1] > 0) { so.bag[t][l - 1]--; so.grid[i] = { t, l }; if (!so.bag[t][l - 1]) R.soulSel = null; }
  }
  Sfx.play('click'); renderTab(); R.dirty.all = true;
}
function soulCombine(t, l) {
  const b = soulState().bag[t];
  if (l >= 4 || b[l] < 3) return;
  b[l] -= 3; b[l + 1]++; log(`🔮 3 ${SOUL[t].name} nv ${l + 1} viraram 1 nv ${l + 2}!`, 'lvl'); Sfx.play('refineOk'); renderTab();
}
function tabAlma() {
  const t = R.almaTab || 'grade';
  const tabs = `<div class="sub-tabs"><button class="btn small ${t === 'grade' ? 'primary' : ''}" data-alab="grade">🔮 Alma</button><button class="btn small ${t === 'art' ? 'primary' : ''}" data-alab="art">🏺 Artefatos</button></div>`;
  return tabs + buildBox() + (t === 'art' ? tabArts() : tabSoul());
}
function tabSoul() {
  const so = soulState(), lines = soulLines(), B = soulBonus();
  const lineSet = new Set(); for (const L of lines) for (let j = 0; j < 5; j++) lineSet.add(L.dir === 'row' ? L.k * 5 + j : j * 5 + L.k);
  const cells = so.grid.map((c, i) => { const open = soulCellOpen(i);
    return `<button class="soul-cell ${open ? '' : 'locked'} ${lineSet.has(i) ? 'combo' : ''}" data-soul="${i}" ${c ? `style="--sc:${SOUL[c.t].color}"` : ''}>${c ? `${SOUL[c.t].icon}<i>${c.l}</i>` : open ? '' : '🔒'}</button>`; }).join('');
  const bag = Object.entries(SOUL).map(([k, v]) => `<div class="soul-bag-row"><span>${v.icon} ${v.name}</span>${so.bag[k].map((n, l) => `<button class="soul-stone ${R.soulSel && R.soulSel.t === k && R.soulSel.l === l + 1 ? 'sel' : ''}" data-ssel="${k}:${l + 1}" ${n ? '' : 'disabled'}>nv${l + 1}<b>${n}</b></button>`).join('')}${so.bag[k].some((n, l) => n >= 3 && l < 4) ? `<button class="btn small" data-scomb="${k}:${so.bag[k].findIndex((n, l) => n >= 3 && l < 4)}">Juntar 3</button>` : ''}</div>`).join('');
  const bonus = Object.entries(SOUL).map(([k, v]) => B[v.k] ? `<span>${v.fmt(B[v.k])}</span>` : '').join('');
  return `<p class="muted">Escolha uma pedra embaixo e toque num espaço. Linha ou coluna com 5 pedras <b>iguais</b> dá bônus forte; com os <b>5 tipos diferentes</b> dá <b>Harmonia</b> (um pouco de tudo). Abertos: ${soulOpen()}/25 (abre mais a cada 5 níveis depois do 20).</p>
    <div class="soul-wrap"><div class="soul-grid">${cells}</div>
    <div class="soul-side"><h4>Bônus da Alma</h4><div class="soul-bonus">${bonus || '<span class="muted">Nenhum ainda.</span>'}</div>
    <h4>Combinações (${lines.length})</h4>${lines.map((L) => `<div class="muted small-note">${L.dir === 'row' ? 'Linha' : 'Coluna'} ${L.k + 1}: ${L.kind === 'same' ? SOUL[L.t].icon + ' ' + SOUL[L.t].name + ' ×5' : '✨ Harmonia'} (nv ${L.lvl})</div>`).join('') || '<div class="muted small-note">Complete uma linha ou coluna.</div>'}</div></div>
    <h4>Suas pedras</h4><div class="soul-bag">${bag}</div>
    <p class="muted small-note">Pedras caem de qualquer monstro (raro), de elites, chefes, masmorras, guardiões da torre e da missão semanal.</p>`;
}
function tabArts() {
  artState();
  const tot = artTotal(), c = artAt('c');
  const spot = (sp) => { const a = artAt(sp); return `<button class="art-spot ${sp === 'c' ? 'center' : ''}" data-aspot="${sp}">${a ? `<span>${itemIcon({ slot: a.slot, wtype: a.wtype })}</span><small style="color:${rarityOf(a).color}">${esc(a.name)}</small>${sp !== 'c' && c ? `<em>+${Math.round(artAmp(a, c) * 100)}%</em>` : ''}` : `<small class="muted">${sp === 'c' ? 'Principal' : 'Amplia'}</small>`}</button>`; };
  const list = S.arts.map((a) => { const on = Object.values(S.artCross).includes(a.uid);
    return `<button class="art-item ${R.artSel === a.uid ? 'sel' : ''} ${on ? 'on' : ''}" data-asel="${a.uid}"><b style="color:${rarityOf(a).color}">${esc(a.name)}</b><small>${ART_POWER[a.slot].label.replace(/^de /, '')} · força ${artForce(a).toFixed(1)}${on ? ' · na cruz' : ''}</small></button>`; }).join('');
  return `<p class="muted">Itens <b>+10</b> podem ser consagrados (na janela do item ou do refino) e viram artefatos. O do <b>centro</b> dá o poder do tipo da peça; os 4 de volta <b>ampliam</b> esse poder. Mesmo tipo ou mesmo conjunto do centro = <b>ressonância</b> (amplia 50% mais).</p>
    <div class="art-wrap"><div class="art-cross"><i></i>${spot('n')}<i></i>${spot('o')}${spot('c')}${spot('l')}<i></i>${spot('s')}<i></i></div>
    <div class="art-info">${tot ? `<h4>Poder ativo</h4><p><b>${tot.P.fmt(tot.v)}</b> ${tot.P.label}</p><p class="muted">Ampliação total ×${tot.amp.toFixed(2)}</p>` : '<p class="muted">Coloque um artefato no centro.</p>'}
    <h4>Poder de cada peça</h4>${Object.entries(ART_POWER).map(([k, v]) => `<div class="muted small-note">${k === 'arma' ? '⚔️ Arma' : ARMOR_SLOTS[k].icon + ' ' + ARMOR_SLOTS[k].label}: ${v.label.replace(/^de /, '')}</div>`).join('')}</div></div>
    <h4>Seus artefatos (${S.arts.length}/${ART_MAX})</h4><p class="muted small-note">Toque num artefato e depois num espaço da cruz. Toque num espaço sem escolher nada para tirar.</p><div class="art-list">${list || '<p class="muted">Nenhum ainda. Refine um item até +10 e consagre.</p>'}</div>`;
}

// ---------- montagem automática da Alma e dos artefatos, conforme o personagem ----------
// perfil base de cada classe: quem bate muito busca defesa; quem é frágil ou tanque busca o que falta
const CLASS_BUILD = {
  gladiador:  { w: { def: 3, vit: 3, res: 2, atk: 1, crit: 1 }, why: 'bate muito forte e luta colado nos monstros' },
  lanceiro:   { w: { def: 3, res: 2.5, vit: 2, crit: 1, atk: 1 }, why: 'causa muito dano em área e fica cercado' },
  cacadora:   { w: { vit: 3, def: 2, crit: 2, atk: 1, res: 1.5 }, why: 'já tem muito crítico e pouca vida' },
  valquiria:  { w: { vit: 2, atk: 2, def: 2, crit: 1.5, res: 1 }, why: 'é equilibrada entre ataque e defesa' },
  engenheiro: { w: { atk: 3, crit: 2, vit: 1, def: 1, res: 1 }, why: 'é resistente e tem o autômato para segurar os golpes' },
  paladino:   { w: { atk: 3, crit: 2.5, vit: 1, def: 1, res: 0.5 }, why: 'aguenta muito, mas demora para matar' },
  arcanista:  { w: { atk: 3, crit: 2, vit: 1, res: 1.5, def: 0.5 }, why: 'é maga com escudo de mana e vitalidade' },
  cleriga:    { w: { atk: 3, vit: 2, crit: 1, res: 1.5, def: 1 }, why: 'cura bem, mas tem pouco dano' },
};
const OFF_T = ['atk', 'crit'], DEF_T = ['def', 'vit', 'res'];
const T2SLOT = { atk: 'luvas', crit: 'arma', def: 'armadura', vit: 'elmo', res: 'anel' };
// pesos finais: perfil da classe ajustado pelos pontos do herói (muito em vitalidade = puxa para ataque, e o contrário)
function buildWeights() {
  const c = CLASSES[S.cls], P = CLASS_BUILD[S.cls] || { w: { atk: 1, crit: 1, vit: 1, def: 1, res: 1 }, why: '' };
  const vit = S.attr.vit - c.base.vit, main = S.attr[c.main] - c.base[c.main];
  const share = vit + main > 10 ? vit / (vit + main) : 0.4; // o normal (distribuir automático) fica perto de 0,4
  const adj = clamp(share / 0.4, 0.6, 1.6), w = {};
  for (const t in P.w) w[t] = P.w[t] * (OFF_T.includes(t) ? adj : 1 / adj);
  const tilt = adj > 1.15 ? 'Você pôs muitos pontos em vitalidade, então puxei mais para ataque.' : adj < 0.85 ? 'Você pôs muitos pontos em ataque, então puxei mais para defesa.' : '';
  return { w, why: P.why, tilt, order: Object.keys(w).sort((a, b) => w[b] - w[a]) };
}
function autoSoul(quiet) {
  const so = soulState(), { w, order } = buildWeights();
  for (let i = 0; i < 25; i++) if (so.grid[i]) { so.bag[so.grid[i].t][so.grid[i].l - 1]++; so.grid[i] = null; } // devolve tudo
  const take = (t) => { for (let l = 4; l >= 0; l--) if (so.bag[t][l] > 0) { so.bag[t][l]--; return { t, l: l + 1 }; } return null; };
  const count = (t) => so.bag[t].reduce((a, n) => a + n, 0);
  const open = (i) => soulCellOpen(i);
  // linhas inteiras do mesmo tipo para os atributos mais importantes (dão o bônus forte)
  const totalW = order.reduce((a, t) => a + w[t], 0), rows = [0, 1, 2, 3, 4].sort((a, b) => Math.abs(a - 2) - Math.abs(b - 2)); // centro primeiro
  const plan = []; for (const t of order) { const n = Math.round(5 * w[t] / totalW); for (let k = 0; k < n && plan.length < 5; k++) plan.push(t); }
  while (plan.length < 5) plan.push(order[plan.length % order.length]);
  rows.forEach((r, idx) => {
    const t = plan[idx], cells = [0, 1, 2, 3, 4].map((j) => r * 5 + j).filter(open);
    if (cells.length === 5 && count(t) >= 5) { for (const i of cells) so.grid[i] = take(t); return; }
    // linha incompleta: tenta Harmonia (um de cada) se houver; se não, põe o que for mais útil
    if (cells.length === 5 && Object.keys(SOUL).every((x) => count(x) >= 1)) { Object.keys(SOUL).sort((a, b) => w[b] - w[a]).forEach((x, j) => { so.grid[cells[j]] = take(x); }); return; }
    for (const i of cells) { const x = order.find((y) => count(y) > 0); if (x) so.grid[i] = take(x); }
  });
  if (!quiet) { log(`🔮 Alma montada para ${CLASSES[S.cls].name}: prioridade ${order.slice(0, 2).map((t) => SOUL[t].name).join(' e ')}.`, 'lvl'); renderTab(); }
  R.dirty.all = true;
}
function autoArts(quiet) {
  artState(); if (!S.arts.length) { if (!quiet) toast('Você ainda não tem artefatos.'); return; }
  const { order } = buildWeights();
  const prio = [...order.map((t) => T2SLOT[t]), 'amuleto', 'botas', 'escudo'];
  const score = (a) => (10 - Math.max(0, prio.indexOf(a.slot))) * 100 + artForce(a) * 10; // tipo preferido primeiro, depois força
  const sorted = [...S.arts].sort((a, b) => score(b) - score(a)), c = sorted[0];
  const sides = S.arts.filter((a) => a !== c).sort((a, b) => artAmp(b, c) - artAmp(a, c)).slice(0, 4);
  S.artCross = { c: c.uid }; sides.forEach((a, k) => { S.artCross[ART_SPOTS[k + 1]] = a.uid; });
  if (!quiet) { const P = ART_POWER[c.slot]; log(`🏺 Artefatos montados: centro ${esc(c.name)} (${P.label.replace(/^de /, '')}).`, 'lvl'); renderTab(); }
  R.dirty.all = true;
}
// no modo Auto (ou com a opção ligada), remonta sozinho quando chega pedra ou artefato novo
function autoAlmaMaybe() { if (S.settings.autoAlma) { autoSoul(true); autoArts(true); } }
function buildBox() {
  const b = buildWeights();
  return `<div class="build-box"><b>✨ Sugestão para ${esc(CLASSES[S.cls].name)} <span class="muted">(opcional)</span></b><small>Ela ${esc(b.why)}: a sugestão prioriza <b>${b.order.slice(0, 3).map((t) => SOUL[t].icon + ' ' + SOUL[t].name).join(', ')}</b>. ${esc(b.tilt)}</small>
    <small>Você pode montar do seu jeito: qualquer pedra em qualquer espaço e qualquer artefato na cruz. Todas as combinações valem para todas as classes.</small>
    <div class="row-btns"><button class="btn small" data-act="auto-alma">Usar a sugestão</button><label class="check"><input type="checkbox" data-set="autoAlma" ${S.settings.autoAlma ? 'checked' : ''}> Remontar sozinho com a sugestão</label></div></div>`;
}

// ---------- missão semanal (dá pedras da Alma) ----------
const weekId = () => { const d = new Date(); const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); return Math.floor((t / 864e5 + 3) / 7); }; // muda toda segunda
const WEEKLY = [{ k: 'kills', t: 'Derrote 2.000 monstros', need: 2000 }, { k: 'bosses', t: 'Derrote 12 chefes', need: 12 }, { k: 'dungeons', t: 'Conclua 5 masmorras ou torres', need: 5 }];
function weeklyState() { if (!S.weekly || S.weekly.week !== weekId()) S.weekly = { week: weekId(), prog: [0, 0, 0], claimed: [false, false, false] }; return S.weekly; }
function weeklyProgress(k, n = 1) { const W = weeklyState(); WEEKLY.forEach((w, i) => { if (w.k === k && W.prog[i] < w.need) { W.prog[i] = Math.min(w.need, W.prog[i] + n); if (W.prog[i] >= w.need) log(`🗓️ Missão semanal pronta: ${w.t}! Pegue o prêmio em Missões.`, 'lvl'); } }); }
function claimWeekly(i) {
  const W = weeklyState(); if (W.claimed[i] || W.prog[i] < WEEKLY[i].need) return;
  W.claimed[i] = true; dropSoul(1, S.lvl + 30, 3); S.stones += 5;
  if (W.claimed.every(Boolean)) { dropSoul(1, S.lvl + 90, 3); log('🗓️ Todas as semanais feitas: +3 pedras da Alma de nível alto!', 'lvl'); }
  toast('Prêmio semanal recebido!', 'good'); renderTab();
}
function tabWeekly() {
  const W = weeklyState();
  return `<div class="q-sec">🗓️ Missões semanais <small class="muted">(renovam toda segunda)</small></div>
  ${WEEKLY.map((w, i) => `<div class="q-card ${W.prog[i] >= w.need ? 'ok' : ''}"><h4><span>${w.t}</span><small class="q-rew">3 🔮 · 5 💎</small></h4>
    <div class="q-prog"><i style="width:${W.prog[i] / w.need * 100}%"></i></div><small>${fmt(W.prog[i])}/${fmt(w.need)}</small>
    ${W.prog[i] >= w.need && !W.claimed[i] ? `<div class="item-actions"><button class="btn primary small" data-wclaim="${i}">Pegar prêmio</button></div>` : W.claimed[i] ? '<small class="good"> ✔ recebido</small>' : ''}</div>`).join('')}
  <p class="muted">Faça as 3 para ganhar mais 3 pedras da Alma de nível alto.</p>`;
}

// ---------- missões diárias e prêmio de login ----------
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const DAILY_TYPES = [
  { k: 'kills', t: (n) => `Derrote ${n} monstros`, n: () => 150 },
  { k: 'elites', t: (n) => `Derrote ${n} monstros elite`, n: () => 5 },
  { k: 'bosses', t: (n) => `Derrote ${n} chefe${n > 1 ? 's' : ''}`, n: () => 1 },
  { k: 'skills', t: (n) => `Use habilidades ${n} vezes`, n: () => 200 },
  { k: 'gold', t: (n) => `Ganhe ${fmt(n)} de ouro`, n: () => Math.round(800 * Math.pow(S.lvl, 1.4)) },
  { k: 'dungeons', t: (n) => `Conclua ${n} masmorra`, n: () => 1, minLvl: 6 },
  { k: 'quests', t: (n) => `Conclua ${n} missões do Comandante`, n: () => 3 },
  { k: 'gather', t: (n) => `Faça ${n} coletas no mapa`, n: () => 12 },
];
function dailyState() {
  const d = today();
  if (!S.daily || S.daily.day !== d) {
    const r = seeded(+d.replace(/-/g, '') + S.cls.length * 31);
    const pool = DAILY_TYPES.filter((x) => !x.minLvl || S.lvl >= x.minLvl), picked = [];
    while (picked.length < 3) { const x = pool[Math.floor(r() * pool.length)]; if (!picked.includes(x)) picked.push(x); }
    S.daily = { day: d, list: picked.map((x) => ({ k: x.k, need: x.n(), prog: 0, done: false })), streak: S.daily ? S.daily.streak : 0, last: S.daily ? S.daily.last : null, bonusTaken: false };
  }
  return S.daily;
}
function dailyProgress(k, n = 1) {
  if (!S) return;
  if (k === 'kills' || k === 'bosses' || k === 'dungeons') weeklyProgress(k, n);
  const D = dailyState();
  for (const m of D.list) if (m.k === k && !m.done) { m.prog = Math.min(m.need, m.prog + n); if (m.prog >= m.need) { m.done = true; toast('Missão diária pronta!', 'good'); log(`📅 Missão diária concluída: ${DAILY_TYPES.find((x) => x.k === k).t(m.need)}. Pegue o prêmio em Missões!`, 'lvl'); } }
}
function dailyReward() { return { gold: Math.round(300 * Math.pow(S.lvl, 1.3)), stones: 2 + Math.floor(S.lvl / 25) }; }
function claimDaily(i) {
  const D = dailyState(), m = D.list[i]; if (!m || !m.done || m.claimed) return;
  m.claimed = true; const r = dailyReward();
  S.gold += r.gold; S.stones += r.stones; Sfx.play('coin');
  log(`📅 Prêmio diário: +${fmt(r.gold)} ouro, +${r.stones} 💎.`, 'lvl');
  if (D.list.every((x) => x.claimed) && !D.bonusTaken) { D.bonusTaken = true; dropGem(1, S.lvl + 20); S.xpBoostUntil = Math.max(Date.now(), S.xpBoostUntil || 0) + 30 * 60000; log('🎉 Todas as diárias feitas! Bônus: uma gema e +50% de XP por 30 min.', 'lvl'); toast('Bônus diário completo!', 'good'); }
  renderTab();
}
// prêmio por dias seguidos (ciclo de 7)
const LOGIN_DAYS = [
  { t: 'Ouro', f: () => ({ gold: 500 * S.lvl }) }, { t: 'Poções', f: () => ({ pots: 30 }) }, { t: 'Pedras', f: () => ({ stones: 5 }) },
  { t: 'Ouro', f: () => ({ gold: 1200 * S.lvl }) }, { t: 'Gemas', f: () => ({ gems: 3 }) }, { t: 'Pedras', f: () => ({ stones: 10 }) },
  { t: 'Baú especial', f: () => ({ gold: 3000 * S.lvl, stones: 15, gems: 3, xp: 60 }) },
];
function checkLogin() {
  const D = dailyState(), d = today();
  if (D.last === d) return null;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yd = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  D.streak = D.last === yd ? D.streak + 1 : 1; D.last = d;
  const idx = (D.streak - 1) % 7, rw = LOGIN_DAYS[idx].f();
  if (rw.gold) S.gold += rw.gold; if (rw.stones) S.stones += rw.stones; if (rw.pots) { S.pots.hp1 += rw.pots; S.pots.mp1 += rw.pots; }
  if (rw.gems) for (let i = 0; i < rw.gems; i++) dropGem(1, S.lvl);
  if (rw.xp) S.xpBoostUntil = Math.max(Date.now(), S.xpBoostUntil || 0) + rw.xp * 60000;
  return { day: idx + 1, streak: D.streak, rw };
}
function showLogin(L) {
  const txt = (rw) => [rw.gold && `${fmt(rw.gold)} ouro`, rw.stones && `${rw.stones} 💎`, rw.pots && `${rw.pots * 2} poções`, rw.gems && `${rw.gems} gemas`, rw.xp && `+50% XP por ${rw.xp} min`].filter(Boolean).join(' · ');
  $('#modal-body').innerHTML = `<h2>🎁 Prêmio diário</h2><p>Dia <b>${L.streak}</b> seguido! Entre todo dia para ganhar prêmios melhores.</p>
    <div class="login-track">${LOGIN_DAYS.map((x, i) => `<div class="ld ${i + 1 < L.day ? 'got' : ''} ${i + 1 === L.day ? 'now' : ''}"><small>Dia ${i + 1}</small><b>${i === 6 ? '🎁' : ['💰', '🧪', '💎', '💰', '💠', '💎'][i]}</b><small>${x.t}</small></div>`).join('')}</div>
    <p class="good center">Hoje: ${txt(L.rw)}</p><button class="btn primary" id="modal-close">Pegar</button>`;
  $('#modal').classList.remove('hidden');
  Sfx.play('levelup');
}

// ---------- renascimento ----------
function canRebirth() { return S.lvl >= MAX_LEVEL; }
function rebirth() {
  if (!canRebirth()) return;
  uiConfirm('Renascer', `Você volta ao nível 1, mas ganha para sempre +10% de ataque, +10% de experiência, +10% de ouro e +5% de vida (acumula a cada renascimento). Itens, ouro, gemas, montarias e conquistas ficam com você; os equipamentos acima do seu nível ficam inativos até você alcançá-los.`, 'Renascer').then((y) => {
    if (!y) return;
    S.rebirths = (S.rebirths || 0) + 1;
    S.lvl = 1; S.xp = 0; S.pts = 0; S.attr = { ...CLASSES[S.cls].base }; S.skillLv = {};
    S.zone = 'z1'; S.zoneKills = {}; R.worldZone = null; R.mon = null; R.buffs = []; R.pet = null;
    if (S.quests) S.quests.active = {};
    const d = derived(); S.hp = d.maxHp; S.mp = d.maxMp;
    log(`🌟 <b>Renascimento ${S.rebirths}!</b> Seu herói recomeça mais forte.`, 'lvl'); Scene.levelUp(); Sfx.play('levelup');
    closeWin(); R.dirty.all = true;
  });
}

// ---------- ranking (servidor) ----------
function tabRanking() {
  if (!online()) return '<p class="muted">O ranking aparece quando você joga com uma conta online.</p>';
  Net.ranking().then((list) => {
    if (R.tab !== 'ranking') return;
    const el = document.getElementById('rank-list'); if (!el) return;
    el.innerHTML = list.length ? list.map((r, i) => `<div class="rank-row ${r.user === Net.st.user ? 'me' : ''}"><b>${i + 1}º</b><span>${CLASSES[r.cls].icon} ${esc(r.name)} <small class="muted">(${esc(r.user)})</small></span><span>${r.rebirths ? '★' + r.rebirths + ' ' : ''}Nv. ${r.lvl}</span><small class="muted">${fmt(r.kills)} abates</small></div>`).join('') : '<p class="muted">Ninguém no ranking ainda.</p>';
  }).catch(() => {});
  return `<p class="muted">Os melhores heróis do servidor (renascimentos, nível e abates). 🌐 ${Net.st.online} online agora.</p><div id="rank-list" class="rank-list">Carregando...</div>`;
}

// ---------- conquistas ----------
const anyEquip = (f) => SLOT_ORDER.some((sl) => S.equip[sl] && f(S.equip[sl]));
const ACH = [
  { id: 'k100', name: 'Primeiro Sangue', desc: 'Derrote 100 monstros', ok: () => S.stats.kills >= 100, gold: 2000 },
  { id: 'k1000', name: 'Exterminador', desc: 'Derrote 1.000 monstros', ok: () => S.stats.kills >= 1000, stones: 5, title: 'Exterminador' },
  { id: 'k10000', name: 'Lenda da Caçada', desc: 'Derrote 10.000 monstros', ok: () => S.stats.kills >= 10000, stones: 25, title: 'Lenda da Caçada' },
  { id: 'b1', name: 'Matador de Chefes', desc: 'Derrote um chefe', ok: () => S.stats.bosses >= 1, gold: 5000 },
  { id: 'b10', name: 'Terror dos Chefes', desc: 'Derrote 10 chefes', ok: () => S.stats.bosses >= 10, stones: 5, title: 'Terror dos Chefes' },
  { id: 'b50', name: 'Rei da Arena', desc: 'Derrote 50 chefes', ok: () => S.stats.bosses >= 50, stones: 20, title: 'Rei da Arena' },
  { id: 'e10', name: 'Caçador de Elites', desc: 'Derrote 10 elites', ok: () => (S.stats.elites || 0) >= 10, gold: 10000, title: 'Caçador de Elites' },
  { id: 'e100', name: 'Flagelo Dourado', desc: 'Derrote 100 elites', ok: () => (S.stats.elites || 0) >= 100, stones: 15 },
  { id: 'l10', name: 'Aventureiro', desc: 'Chegue ao nível 10', ok: () => S.lvl >= 10, gold: 1000 },
  { id: 'l25', name: 'Veterano', desc: 'Chegue ao nível 25', ok: () => S.lvl >= 25, gold: 8000, title: 'Veterano' },
  { id: 'l50', name: 'Herói do Reino', desc: 'Chegue ao nível 50', ok: () => S.lvl >= 50, stones: 10, title: 'Herói do Reino' },
  { id: 'l75', name: 'Campeão', desc: 'Chegue ao nível 75', ok: () => S.lvl >= 75, stones: 20, title: 'Campeão' },
  { id: 'l100', name: 'Lenda de Valdária', desc: 'Chegue ao nível 100', ok: () => S.lvl >= 100, stones: 50, title: 'Lenda de Valdária' },
  { id: 'r5', name: 'Aprendiz de Ferreiro', desc: 'Use um item +5', ok: () => anyEquip((it) => it.refine >= 5), gold: 5000 },
  { id: 'r10', name: 'Mestre Ferreiro', desc: 'Use um item +10', ok: () => anyEquip((it) => it.refine >= 10), stones: 10, title: 'Mestre Ferreiro' },
  { id: 'leg', name: 'Brilho Lendário', desc: 'Equipe um item lendário', ok: () => anyEquip((it) => it.rarity === 'lendario'), stones: 5, title: 'Portador Lendário' },
  { id: 'gem5', name: 'Joalheiro', desc: 'Tenha uma gema nível 5', ok: () => Object.values(gemBag()).some((v) => v[4] > 0) || anyEquip((it) => (it.gems || []).some((g) => g.l >= 5)), stones: 10, title: 'Joalheiro' },
  { id: 'q10', name: 'Prestativo', desc: 'Conclua 10 missões', ok: () => Object.keys(questState().done).length >= 10, gold: 15000 },
  { id: 'q40', name: 'Herói do Povo', desc: 'Conclua as 40 missões', ok: () => Object.keys(questState().done).length >= 40, stones: 30, title: 'Herói do Povo' },
  { id: 'd1', name: 'Explorador de Masmorras', desc: 'Conclua uma masmorra', ok: () => (S.stats.dungeons || 0) >= 1, stones: 3 },
  { id: 't10', name: 'Escalador', desc: 'Chegue ao andar 10 da Torre Infinita', ok: () => (S.towerBest || 0) >= 10, stones: 5 },
  { id: 't30', name: 'Mestre da Torre', desc: 'Chegue ao andar 30 da Torre Infinita', ok: () => (S.towerBest || 0) >= 30, stones: 20, title: 'Mestre da Torre' },
  { id: 'wb1', name: 'Caçador de Avatares', desc: 'Derrote um Chefe Mundial', ok: () => (S.stats.wbosses || 0) >= 1, stones: 8, title: 'Caçador de Avatares' },
  { id: 'exp4', name: 'Desbravador', desc: 'Descubra os 4 mapas escondidos andando pelas saídas', ok: () => Object.keys(S.visited || {}).length >= 4, stones: 10, title: 'Desbravador' },
  { id: 'art1', name: 'Consagrado', desc: 'Transforme um item +10 em artefato', ok: () => (S.stats.arts || 0) >= 1, stones: 10, title: 'Consagrado' },
  { id: 'soul5', name: 'Alma em Harmonia', desc: 'Forme uma combinação na grade da Alma', ok: () => S.soul && soulLines().length >= 1, stones: 10, title: 'Alma em Harmonia' },
  { id: 'ro1', name: 'Rastreador', desc: 'Derrote um monstro Errante', ok: () => (S.stats.roamers || 0) >= 1, stones: 5, title: 'Rastreador' },
  { id: 'cr10', name: 'Mãos de Artesão', desc: 'Crie 10 itens com materiais coletados', ok: () => (S.stats.crafts || 0) >= 10, stones: 5 },
  { id: 'd10', name: 'Senhor das Profundezas', desc: 'Conclua 10 masmorras', ok: () => (S.stats.dungeons || 0) >= 10, stones: 15, title: 'Senhor das Profundezas' },
  { id: 'rb1', name: 'Renascido', desc: 'Renasça pela primeira vez', ok: () => (S.rebirths || 0) >= 1, stones: 30, title: 'Renascido' },
  { id: 'rb5', name: 'Imortal', desc: 'Renasça 5 vezes', ok: () => (S.rebirths || 0) >= 5, stones: 80, title: 'Imortal' },
  { id: 'mnt', name: 'Cavaleiro', desc: 'Tenha uma montaria', ok: () => S.owned && (S.owned.mount1 || S.owned.mount2), gold: 10000 },
];
function checkAch() {
  S.ach = S.ach || {};
  for (const a of ACH) if (!S.ach[a.id] && a.ok()) {
    S.ach[a.id] = true;
    if (a.gold) S.gold += a.gold; if (a.stones) S.stones += a.stones;
    if (a.title && !S.title) S.title = a.title;
    log(`🏆 Conquista: <b>${esc(a.name)}</b>! ${a.gold ? '+' + fmt(a.gold) + ' ouro ' : ''}${a.stones ? '+' + a.stones + ' 💎 ' : ''}${a.title ? '· título “' + esc(a.title) + '”' : ''}`, 'lvl');
    toast(`🏆 ${a.name}`, 'good'); Sfx.play('levelup');
    renderHeader();
  }
}
function tabAch() {
  S.ach = S.ach || {};
  const done = ACH.filter((a) => S.ach[a.id]).length, titles = ACH.filter((a) => a.title && S.ach[a.id]).map((a) => a.title);
  return `<p class="muted">Conquistas: <b>${done}/${ACH.length}</b>. Títulos aparecem embaixo do seu nome.</p>
  ${titles.length ? `<div class="q-sec">Título</div><div class="row-btns"><button class="btn small ${!S.title ? 'primary' : ''}" data-ach="-">Nenhum</button>${titles.map((t) => `<button class="btn small ${S.title === t ? 'primary' : ''}" data-ach="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
  <div class="q-sec">Lista</div>${ACH.map((a) => `<div class="q-card ${S.ach[a.id] ? 'ok' : ''}"><h4><span>${S.ach[a.id] ? '🏆' : '🔒'} ${esc(a.name)}</span><small class="q-rew">${a.gold ? fmt(a.gold) + ' ouro ' : ''}${a.stones ? a.stones + ' 💎 ' : ''}${a.title ? '· título' : ''}</small></h4><p>${esc(a.desc)}</p></div>`).join('')}`;
}

// ---------- tutorial ----------
const TUT = [
  { text: '👆 Toque no chão para andar até lá.', ok: () => R.pos && dist2(R.pos, WORLD.entry) > 3 },
  { text: '⚔️ Toque num monstro para atacar. Derrote um!', ok: () => S.stats.kills >= 1 },
  { text: '✨ Toque numa habilidade na barra de baixo para usá-la.', ok: () => R.castCount > 0 },
  { text: '🎒 Abra a mochila (Itens) e toque em “Equipar melhores”.', ok: () => R.equipped, start: () => { if (!S.inv.length) dropItem(genItem(Math.max(2, S.lvl), 2, 'armadura')); } },
  { text: '🤖 Ligue o Auto: o herói passa a caçar sozinho.', ok: () => S.settings.auto },
  { text: '🏰 Vá à Cidade e fale com o ⚔️ Comandante para pegar missões.', ok: () => R.npc === 'guarda' },
];
function tutTick() {
  if (S.tut == null || S.tut >= TUT.length) return;
  const st0 = TUT[S.tut];
  if (!R.tutStarted) { R.tutStarted = true; st0.start && st0.start(); }
  if (st0.ok()) {
    S.tut++; R.tutStarted = false; Sfx.play('open');
    if (S.tut >= TUT.length) { S.gold += 1000; S.pots.hp1 += 20; S.pots.mp1 += 20; log('🎓 Tutorial concluído! +1.000 ouro e 40 poções.', 'lvl'); toast('Tutorial concluído!', 'good'); S.tut = 99; }
    renderTut();
  }
}
function renderTut() {
  const el = document.getElementById('tut'); if (!el) return;
  const on = S && S.tut != null && S.tut < TUT.length;
  el.classList.toggle('hidden', !on);
  if (on) el.innerHTML = `<b>Tutorial ${S.tut + 1}/${TUT.length}</b><span>${TUT[S.tut].text}</span><button class="btn tiny" data-tutskip>Pular</button>`;
}

// ---------- missões ----------
function questDefs() {
  if (questDefs.cache) return questDefs.cache;
  const list = [];
  ZONES.forEach((z, zi) => {
    const lvl = z.min + Math.floor(zoneSpan(z) / 2);
    z.monsters.forEach(([name, icon], mi) => list.push({
      id: `${z.id}_m${mi}`, zone: z.id, target: name, icon, need: 12 + zi * 2 + mi * 2, minLvl: Math.max(1, z.min - 3),
      title: `Caçada: ${name}`, desc: `Derrote ${12 + zi * 2 + mi * 2} ${name} em ${z.name}.`,
      xp: Math.round(xpNeed(lvl) * 0.12), gold: Math.round((2 + lvl * 1.5) * 45), stones: zi >= 2 ? 1 : 0,
    }));
    list.push({
      id: `${z.id}_boss`, zone: z.id, target: z.boss[0], icon: z.boss[1], need: 1, minLvl: z.min, boss: true,
      title: `Ameaça: ${z.boss[0]}`, desc: `Derrote o chefe ${z.boss[0]} na arena de ${z.name}.`,
      xp: Math.round(xpNeed(lvl + 2) * 0.35), gold: Math.round((2 + lvl * 1.5) * 200), stones: 3, item: true,
    });
  });
  questDefs.cache = list;
  return list;
}
const MAX_QUESTS = 5;
function questState() { if (!S.quests) S.quests = { active: {}, done: {} }; return S.quests; }
function acceptQuest(id) {
  const q = questState();
  if (Object.keys(q.active).length >= MAX_QUESTS || q.active[id] != null || q.done[id]) return;
  q.active[id] = 0; Sfx.play('open');
  const def = questDefs().find((x) => x.id === id);
  log(`📋 Missão aceita: <b>${esc(def.title)}</b>`, 'lvl');
}
function turnInQuest(id) {
  const q = questState(), def = questDefs().find((x) => x.id === id);
  if (!def || (q.active[id] || 0) < def.need) return;
  delete q.active[id]; q.done[id] = true; dailyProgress('quests');
  S.gold += def.gold; S.stones += def.stones;
  if (def.item) { const z = zoneById(def.zone); dropItem(genItem(z.min + zoneSpan(z), 8)); }
  log(`🏆 Missão concluída: <b>${esc(def.title)}</b>! +${fmt(def.xp)} XP, +${fmt(def.gold)} ouro${def.stones ? `, +${def.stones} 💎` : ''}${def.item ? ' e um item especial' : ''}.`, 'lvl');
  Sfx.play('levelup'); toast(`Missão concluída: ${def.title}`, 'good');
  gainXp(def.xp);
  R.dirty.all = true;
}
function questProgress(m) {
  const q = questState();
  for (const id in q.active) {
    const def = questDefs().find((x) => x.id === id);
    if (def && def.target === m.name && q.active[id] < def.need) {
      q.active[id]++;
      if (q.active[id] >= def.need) { log(`✔ Objetivo cumprido: <b>${esc(def.title)}</b>. Entregue a missão!`, 'lvl'); toast(`Missão pronta: ${def.title}`, 'good'); }
    }
  }
  if (S.settings.autoQuest) autoQuests();
}
// modo automático: aceita e entrega as missões do mapa atual
function autoQuests() {
  const q = questState();
  for (const id in q.active) { const def = questDefs().find((x) => x.id === id); if (def && def.zone !== S.zone && q.active[id] < def.need) delete q.active[id]; }
  for (const id in q.active) { const def = questDefs().find((x) => x.id === id); if (def && q.active[id] >= def.need) turnInQuest(id); }
  for (const def of questDefs()) {
    if (Object.keys(q.active).length >= MAX_QUESTS) break;
    if (def.zone === S.zone && S.lvl >= def.minLvl && q.active[def.id] == null && !q.done[def.id]) acceptQuest(def.id);
  }
}
function tabDaily() {
  const D = dailyState(), r = dailyReward();
  return `<div class="q-sec">📅 Missões diárias <small class="muted">(novas a cada dia · ${D.streak || 0} dia(s) seguido(s))</small></div>
  ${D.list.map((m, i) => `<div class="q-card ${m.done ? 'ok' : ''}"><h4><span>${DAILY_TYPES.find((x) => x.k === m.k).t(m.need)}</span><small class="q-rew">${fmt(r.gold)} ouro · ${r.stones} 💎</small></h4>
    <div class="q-prog"><i style="width:${m.prog / m.need * 100}%"></i></div><small>${fmt(m.prog)}/${fmt(m.need)}</small>
    ${m.done && !m.claimed ? `<div class="item-actions"><button class="btn primary small" data-dclaim="${i}">Pegar prêmio</button></div>` : m.claimed ? '<small class="good"> ✔ recebido</small>' : ''}</div>`).join('')}
  <p class="muted">Faça as 3 para ganhar uma gema e +50% de experiência por 30 minutos.</p>`;
}
function tabQuests() {
  return tabDaily() + tabWeekly() + tabQuestsMain();
}
function tabQuestsMain() {
  const q = questState(), defs = questDefs();
  const act = Object.keys(q.active).map((id) => defs.find((d) => d.id === id)).filter(Boolean);
  const avail = defs.filter((d) => S.lvl >= d.minLvl && q.active[d.id] == null && !q.done[d.id]).sort((a, b) => (b.zone === S.zone) - (a.zone === S.zone) || ZONES.findIndex((z) => z.id === b.zone) - ZONES.findIndex((z) => z.id === a.zone)).slice(0, 8);
  const card = (d, active) => {
    const pr = active ? q.active[d.id] : 0, ok = active && pr >= d.need;
    return `<div class="q-card ${ok ? 'ok' : ''}"><h4><span>${d.icon} ${esc(d.title)}</span><small class="muted">${esc(zoneById(d.zone).name)}</small></h4>
      <p>${esc(d.desc)}</p>
      ${active ? `<div class="q-prog"><i style="width:${Math.min(100, pr / d.need * 100)}%"></i></div><small>${pr}/${d.need}</small>` : ''}
      <div class="q-rew">Recompensa: ${fmt(d.xp)} XP · ${fmt(d.gold)} ouro${d.stones ? ` · ${d.stones} 💎` : ''}${d.item ? ' · item especial' : ''}</div>
      <div class="item-actions">${active ? (ok ? `<button class="btn primary small" data-qturn="${d.id}">Entregar</button>` : `<button class="btn small" data-qdrop="${d.id}">Abandonar</button>`) : `<button class="btn small" data-qacc="${d.id}" ${act.length >= MAX_QUESTS ? 'disabled' : ''}>Aceitar</button>`}</div></div>`;
  };
  return `<p class="muted">Aceite até ${MAX_QUESTS} missões. Concluídas: ${Object.keys(q.done).length}/${defs.length}.
    <label class="check"><input type="checkbox" data-set="autoQuest" ${S.settings.autoQuest ? 'checked' : ''}> Aceitar e entregar missões automaticamente</label></p>
    <div class="q-sec">Ativas (${act.length}/${MAX_QUESTS})</div>${act.length ? act.map((d) => card(d, true)).join('') : '<p class="muted">Nenhuma missão ativa.</p>'}
    <div class="q-sec">Disponíveis</div>${avail.length ? avail.map((d) => card(d, false)).join('') : '<p class="muted">Nenhuma missão nova no seu nível.</p>'}`;
}
function renderQuestTrack() {
  const el = document.getElementById('quest-track'); if (!el || !S) return;
  const q = questState(), defs = questDefs();
  el.innerHTML = Object.keys(q.active).map((id) => { const d = defs.find((x) => x.id === id); if (!d) return ''; const pr = q.active[id], ok = pr >= d.need; return `<div class="qt-item ${ok ? 'ok' : ''}" data-win="missoes"><b>${ok ? '✔ ' : ''}${esc(d.title)}</b> ${Math.min(pr, d.need)}/${d.need}</div>`; }).join('');
}

const NPCS = {
  guarda:   { name: 'Comandante Varek', icon: '⚔️', tab: 'missoes', line: 'Os monstros estão cada vez mais ousados. Preciso de alguém que saiba usar uma arma. Topa o serviço?' },
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
  const fn = { mapas: tabMaps, inventario: tabInv, habilidades: tabSkills, loja: tabShop, refino: tabRefine, missoes: tabQuests }[n.tab];
  $('#modal-body').innerHTML = `<div class="npc-head"><span class="npc-ico">${n.icon}</span><div><b>${n.name}</b><p>“${n.line}”</p></div></div>
    ${R.npc === 'mestra' ? `<button class="btn small" data-act="reset-pts">Redistribuir pontos (${fmt(resetCost())} ouro)</button>` : ''}
    <div class="npc-body">${fn()}</div>
    <button class="btn" id="modal-close">Fechar</button>`;
  $('#modal-body').classList.add('wide');
}

function cityName() { return CITIES[CLASSES[S.cls].faction].name; }

function setTown(on) {
  if (R.dungeon && on) exitDungeon(false);
  if (!!R.inTown === on) return;
  R.inTown = on;
  Sfx.play('portal');
  if (on) { R.mons = []; R.mon = null; R.move = null; R.buffs = []; R.pet = null; log(`🏰 Você chegou à <b>${cityName()}</b>. Fale com os moradores!`, 'lvl'); }
  else { R.worldZone = null; log(`⚔️ Você partiu para ${zoneById(S.zone).name}.`, 'muted'); }
  R.dirty.all = true;
}

const WIN_TITLES = { alma: 'Alma e Artefatos', troca: 'Troca', social: 'Grupo e Guilda', bestiario: 'Bestiário', stats: 'Estatísticas', ranking: 'Ranking', conquistas: 'Conquistas', personagem: 'Personagem', inventario: 'Itens', habilidades: 'Habilidades', missoes: 'Missões', mapas: 'Mapas', config: 'Configurações', loja: 'Loja', refino: 'Refino' };
function openWin(name) {
  if (R.win === name) return closeWin();
  R.win = name;
  $('#gwin').classList.remove('hidden');
  $('#gwin-title').textContent = WIN_TITLES[name] || '';
  $('#win-personagem').classList.toggle('hidden', name !== 'personagem');
  $('#tab-content').classList.toggle('hidden', name === 'personagem');
  if (name !== 'personagem') R.tab = name;
  for (const b of document.querySelectorAll('[data-win]')) b.classList.toggle('active', b.dataset.win === name);
  Sfx.play('click');
  if (name === 'personagem') { renderChar(); renderEquip(); } else renderTab();
}
function closeWin() {
  R.win = null; $('#gwin').classList.add('hidden');
  for (const b of document.querySelectorAll('[data-win]')) b.classList.remove('active');
}

function renderTab() {
  const el = $('#tab-content');
  const fn = { mapas: tabMaps, inventario: tabInv, habilidades: tabSkills, loja: tabShop, refino: tabRefine, config: tabConfig, missoes: tabQuests, conquistas: tabAch, ranking: tabRanking, bestiario: tabBestiary, stats: tabStats, social: tabSocial, troca: tabTrade, alma: tabAlma }[R.tab];
  if (fn) el.innerHTML = fn();
  if (R.npc) renderNpc();
  renderQuestTrack();
}

function tabMaps() {
  const entry = (z) => {
    const locked = S.lvl < z.min - 3, cur = z.id === S.zone;
    if (z.parent && !(S.visited || {})[z.id]) return `<div class="zone zone-hidden"><span class="zone-ico">❓</span><span class="zone-info"><b>Mapa escondido</b><small>Ache a saída de baixo (▼) em ${esc(zoneById(z.parent).name)} · Nível ${z.min}+</small></span></div>`;
    return `<button class="zone ${cur ? 'active' : ''} ${z.parent ? 'zone-branch' : ''}" data-zone="${z.id}" ${locked ? 'disabled' : ''}>
      <span class="zone-ico">${z.icon}</span>
      <span class="zone-info"><b>${z.parent ? '↳ ' : ''}${z.name}</b><small>Nível ${z.min} – ${z.min + zoneSpan(z)} · Chefe: ${z.boss[1]} ${z.boss[0]}</small>
      <small class="muted">${z.monsters.map((m) => m[1] + ' ' + m[0]).join(' · ')}</small>
      <small class="muted">Chefes derrotados: ${S.bosses[z.id] || 0}</small></span>
      ${locked ? `<span class="lock">🔒 Nv.${z.min - 3}</span>` : ''}
    </button>${S.lvl >= z.min ? `<button class="btn small dun-btn" data-dun="${z.id}" ${!dunReady(z.id) || S.gold < dunCost(z) ? 'disabled' : ''}>🕳️ Masmorra · ${fmt(dunCost(z))} ouro${dunReady(z.id) ? '' : ` · ${Math.ceil((S.dunCd[z.id] - Date.now()) / 60000)} min`}</button>${canCoop() ? `<button class="btn small dun-btn primary" data-codun="${z.id}" ${!dunReady(z.id) || S.gold < dunCost(z) ? 'disabled' : ''}>👥 Em grupo</button>` : ''}` : ''}`;
  };
  return tabTower() + `<p class="muted map-tip">🚶 Os mapas são ligados: ande até as saídas nas bordas (◀ ▶ ▼ no minimapa) para ir ao vizinho, ou toque num mapa abaixo para teleportar. Alguns mapas são escondidos e só aparecem depois que você chega neles a pé.</p><div class="zone-list">${ZONES.map((z) => entry(z) + BRANCHES.filter((b) => b.parent === z.id).map(entry).join('')).join('')}</div>`;
}

function tabInv() {
  const sel = S.inv.find((i) => i.uid === R.sel) || (R.selEq && S.equip[R.selEq]);
  let html = `<div class="inv-head"><span>Mochila ${S.inv.length}/40</span>
    <span><button class="btn small primary" data-act="equip-best">Equipar melhores</button><button class="btn small" data-act="sort">Ordenar</button>
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
      `<button class="btn" data-act="to-refine">Refinar</button>${(sel.refine || 0) >= 10 ? '<button class="btn primary" data-act="consagrar">🏺 Consagrar</button>' : ''}</div>`;
  } else html += `<p class="muted center">Clique em um item para ver detalhes. ▲ indica melhoria.</p>`;
  return html;
}

function itemScore(it) {
  const ri = RARITIES.findIndex((r) => r.id === it.rarity);
  const base = it.slot === 'arma' ? (it.min + it.max) / 2 : it.def;
  return base * refineMult(it) * 1.5 + it.affixes.length * it.ilvl * 0.6 + ri * it.ilvl * 0.4 + (it.gems || []).reduce((a, g) => a + g.l * 8, 0);
}
function equipBest() {
  let changed = 0;
  for (const sl of SLOT_ORDER) {
    const cands = S.inv.filter((it) => it.slot === sl && canEquip(it) && (sl !== 'arma' || CLASSES[S.cls].anyWeapon || it.wtype === CLASSES[S.cls].weapon));
    if (!cands.length) continue;
    const best = cands.sort((a, b) => itemScore(b) - itemScore(a))[0];
    if (!S.equip[sl] || itemScore(best) > itemScore(S.equip[sl])) { equipItem(best.uid); changed++; }
  }
  toast(changed ? `${changed} ${changed > 1 ? 'itens equipados' : 'item equipado'}!` : 'Você já está com os melhores itens.', changed ? 'good' : '');
  R.dirty.all = true;
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
  const free = skillPointsFree();
  const sp = specOf(), specs = SPECS[S.cls] || [];
  const specHtml = `<div class="q-sec">Especialização ${S.lvl < SPEC_LVL ? `<small class="muted">(libera no nível ${SPEC_LVL})</small>` : ''}</div>
    <div class="spec-grid">${specs.map((x) => `<div class="spec-card ${sp && sp.id === x.id ? 'on' : ''}"><b>${x.icon} ${x.name}</b><small>${x.desc}</small>
      ${S.lvl >= SPEC_LVL ? (sp && sp.id === x.id ? '<span class="good">Ativa</span>' : `<button class="btn small ${sp ? '' : 'primary'}" data-spec="${x.id}">${sp ? `Trocar (${fmt(20000 * S.lvl)} ouro)` : 'Escolher'}</button>`) : ''}</div>`).join('')}</div>`;
  return specHtml + `<p class="muted">Você ganha 1 ponto de habilidade a cada ~2 níveis. Cada nível aumenta o dano, a duração e o efeito, e reduz a recarga. Toque em "Ligada" para controlar o uso automático.</p>
  <div class="sk-points">Pontos de habilidade: <b>${free}</b> <label class="check" style="display:inline-flex;margin-left:10px"><input type="checkbox" data-set="autoSkill" ${S.settings.autoSkill ? 'checked' : ''}> distribuir automaticamente</label></div>
  <div class="skill-list">${classSkills().map((s) => {
    const locked = S.lvl < s.lvl, on = !S.skillOff[s.id], max = s.lv >= SKILL_MAX;
    const next = !max ? skillAt({ ...CLASSES[S.cls].skills.find((x) => x.id === s.id) }) : null;
    return `<div class="skill-row ${locked ? 'locked' : ''}">
      <div><b>${esc(s.name)}</b> <span class="tag ${s.type}">${{ dmg: 'Ataque', aoe: 'Área', buff: 'Bônus', heal: 'Cura', summon: 'Invocação', stealth: 'Furtividade', passive: 'Passiva' }[s.type]}</span>
        ${locked ? '' : `<span class="sk-lvl">Nv. ${s.lv}/${SKILL_MAX}</span>`}<br><small class="muted">${skillDesc(s)}</small></div>
      <div class="sk-btns">${locked ? `<span class="lock">🔒 Nv.${s.lvl}</span>` : `
        <button class="btn small primary" data-skup="${s.id}" ${free <= 0 || max ? 'disabled' : ''} title="Subir nível">${max ? 'MÁX' : '＋'}</button>
        ${s.type === 'passive' ? '<span class="tag passive">Sempre ativa</span>' : `<button class="btn small ${on ? 'primary' : ''}" data-toggle-skill="${s.id}">${on ? 'Ligada' : 'Desligada'}</button>`}`}</div>
    </div>`;
  }).join('')}</div>`;
}

function tabShop() {
  S.owned = S.owned || {};
  const row = (p) => {
    const unique = p.type === 'mount' || p.type === 'pet', own = unique && S.owned[p.id];
    const active = (p.type === 'mount' && S.mount === p.id) || (p.type === 'pet' && S.companion === p.id);
    const have = p.type === 'pet' && S.owned[p.id] ? `nível ${petLevel(p.id)}/10 (bônus ×${petMult(p.id).toFixed(2)})` : p.type === 'mat' ? S.stones : p.type === 'scroll' ? (xpBoostOn() ? `ativo (${Math.ceil((S.xpBoostUntil - Date.now()) / 60000)} min)` : '-') : p.type === 'gembag' ? Object.values(gemBag()).reduce((a, v) => a + v.reduce((x, y) => x + y, 0), 0) + ' gemas' : unique ? (own ? (active ? 'em uso' : 'guardado') : 'não tem') : S.pots[p.id];
    const desc = p.desc || (p.type === 'mat' ? 'Usada para refinar e forjar equipamentos' : `Restaura ${p.heal * 100}% de ${p.type === 'hp' ? 'vida' : 'mana'}`);
    return `<div class="shop-row"><span class="shop-ico">${p.icon}</span>
      <div><b>${p.name}</b><br><small class="muted">${desc} · Você tem: <b>${have}</b></small></div>
      <span class="price">${own ? '' : '💰 ' + fmt(p.price)}</span>
      <span class="buy">${unique ? `<button class="btn small ${own ? '' : 'primary'}" data-buy="${p.id}" data-n="1" ${!own && S.gold < p.price ? 'disabled' : ''}>${own ? (active ? 'Guardar' : 'Usar') : 'Comprar'}</button>`
        : [1, 10, 50].filter((n) => p.type === 'scroll' || p.type === 'gembag' ? n <= 10 : true).map((n) => `<button class="btn small" data-buy="${p.id}" data-n="${n}" ${S.gold < p.price * n ? 'disabled' : ''}>x${n}</button>`).join('')}</span></div>`;
  };
  return `<p class="muted">Poções são usadas automaticamente conforme suas configurações. Montarias deixam o herói mais rápido ao viajar; mascotes dão bônus permanentes.</p>
  <div class="q-sec">Consumíveis</div><div class="shop-list">${SHOP.filter((p) => !['mount', 'pet'].includes(p.type)).map(row).join('')}</div>
  <div class="q-sec">Montarias e mascotes</div><div class="shop-list">${SHOP.filter((p) => ['mount', 'pet'].includes(p.type)).map(row).join('')}</div>`;
}

function tabRefine() {
  const ft = R.forgeTab || 'refinar';
  const tabs = `<div class="sub-tabs">${[['refinar', '🔨 Refinar'], ['gemas', '💠 Gemas'], ['forjar', '⚒️ Forjar'], ['criar', '🌿 Criar']].map(([k, n]) => `<button class="btn small ${ft === k ? 'primary' : ''}" data-ftab="${k}">${n}</button>`).join('')}</div>`;
  if (ft === 'gemas') return tabs + tabGems();
  if (ft === 'forjar') return tabs + tabForge();
  if (ft === 'criar') return tabs + tabCraft();
  return tabs + tabRefineItems();
}
function tabGems() {
  const bag = gemBag(), all = allItems(), sel = all.find((i) => i.uid === R.refSel);
  let h = `<p class="muted">Cada raridade dá encaixes: Mágico 1, Raro 2, Épico 3, Lendário 4. Junte 3 gemas iguais para subir de nível (até 5).</p>
  <div class="gem-bag">${Object.entries(GEMS).map(([k, g]) => `<div class="gem-row"><span>${g.icon} <b>${g.name}</b> <small class="muted">+${g.per}${g.label}/nv</small></span>
    <span class="gem-lv">${bag[k].map((n, l) => `<span title="Nível ${l + 1}">N${l + 1}: <b>${n}</b>${n >= 3 && l < 4 ? ` <button class="btn tiny" data-gcomb="${k}:${l}" ${S.gold < 1000 * (l + 1) ? 'disabled' : ''} title="Combinar 3 (${fmt(1000 * (l + 1))} ouro)">⇧</button>` : ''}</span>`).join('')}</span></div>`).join('')}</div>
  <div class="q-sec">Escolha um equipamento</div>
  <div class="inv-grid">${all.filter((it) => sockets(it) > 0).map((it) => `<div class="inv-item ${it.uid === R.refSel ? 'sel' : ''}" data-ref="${it.uid}" style="--rc:${rarityOf(it).color}" title="${esc(it.name)}">${itemIcon(it)}<i>${(it.gems || []).length}/${sockets(it)}</i></div>`).join('') || '<p class="muted">Nenhum item com encaixe (precisa ser Mágico ou melhor).</p>'}</div>`;
  if (sel && sockets(sel) > 0) {
    h += `<div class="refine-box"><b>${itemTitle(sel)}</b><div class="sockets">`;
    for (let i = 0; i < sockets(sel); i++) {
      const g = (sel.gems || [])[i];
      h += g ? `<span class="sock full" style="--gc:${GEMS[g.t].color}">${GEMS[g.t].icon} ${GEMS[g.t].name} ${g.l} <button class="btn tiny" data-gout="${sel.uid}:${i}" title="Remover (${fmt(500 * g.l)} ouro)">✕</button></span>`
        : `<span class="sock">Vazio ${Object.keys(GEMS).filter((k) => bag[k].some((n) => n > 0)).map((k) => `<button class="btn tiny" data-gin="${sel.uid}:${k}" title="Encaixar a melhor ${GEMS[k].name}">${GEMS[k].icon}</button>`).join('')}</span>`;
    }
    h += `</div></div>`;
  }
  return h;
}
function tabForge() {
  const c = forgeCost();
  return `<p class="muted">O Ferreiro forja um item do seu nível com boa chance de raridade alta. Custo: <b>${fmt(c.gold)}</b> ouro + <b>${c.stones}</b> 💎 (você tem ${fmt(S.gold)} e ${S.stones}).</p>
  <div class="forge-grid">${SLOT_ORDER.map((sl) => `<button class="btn" data-forge="${sl}" ${S.gold < c.gold || S.stones < c.stones ? 'disabled' : ''}>${sl === 'arma' ? '⚔️ Arma' : ARMOR_SLOTS[sl].icon + ' ' + ARMOR_SLOTS[sl].label}</button>`).join('')}</div>`;
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

function tabRefineItems() {
  const all = [...SLOT_ORDER.map((s) => S.equip[s]).filter(Boolean), ...S.inv];
  const sel = all.find((i) => i.uid === R.refSel);
  let html = `<p class="muted">Refine seus itens até <b>+10</b>. Cada nível aumenta 8% do dano/defesa base. A partir de +5, falhar faz o item perder um nível. Você tem <b>${S.stones}</b> 💎.</p>
  <div class="inv-grid">${all.map((it) => `<div class="inv-item ${it.uid === R.refSel ? 'sel' : ''}" data-ref="${it.uid}" style="--rc:${rarityOf(it).color}" title="${esc(it.name)}">${itemIcon(it)}${it.refine ? `<i>+${it.refine}</i>` : ''}${Object.values(S.equip).some((e) => e && e.uid === it.uid) ? '<b class="eqd">E</b>' : ''}</div>`).join('')}</div>`;
  if (sel) {
    const r = refineInfo(sel);
    html += itemDetail(sel, false);
    if (sel.refine >= 10) html += `<p class="good center">Item no refino máximo! <button class="btn primary small" data-act="consagrar">🏺 Consagrar como artefato</button></p>`;
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
    <label>Qualidade gráfica:
      <select data-set="quality">
        <option value="alta" ${st.quality === 'alta' ? 'selected' : ''}>Alta (sombras e muitas partículas)</option>
        <option value="media" ${st.quality === 'media' ? 'selected' : ''}>Média</option>
        <option value="baixa" ${st.quality === 'baixa' ? 'selected' : ''}>Baixa (celulares mais simples)</option>
      </select></label>
    <label>Gráficos da batalha:
      <select data-set="gfx">
        <option value="3d" ${st.gfx !== '2d' ? 'selected' : ''}>3D (Three.js)</option>
        <option value="2d" ${st.gfx === '2d' ? 'selected' : ''}>2D (mais leve)</option>
      </select></label>
    <label class="check"><input type="checkbox" data-set="autoBoss" ${st.autoBoss ? 'checked' : ''}> Desafiar chefe automaticamente (a cada 25 abates, quando tiver nível para ele)</label>
    <label class="check"><input type="checkbox" data-set="autoTravel" ${st.autoTravel !== false ? 'checked' : ''}> No modo Auto, andar até o mapa do seu nível pelas saídas</label>
    <label class="check"><input type="checkbox" data-set="autoGather" ${st.autoGather !== false ? 'checked' : ''}> Coletar materiais automaticamente no modo Auto</label>
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
  R.equipped = true;
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
  const t = e.target.closest('[data-play],[data-del],[data-new],[data-faction],[data-cls],[data-attr],[data-zone],[data-tab],[data-item],[data-eq],[data-act],[data-buy],[data-ref],[data-toggle-skill],[data-skill],[data-npc],[data-win],[data-cast],[data-pot],[data-chat],[data-qacc],[data-qturn],[data-qdrop],[data-skup],[data-spec],[data-dun],[data-tower],[data-craft],[data-goexit],[data-soc],[data-pinv],[data-ginv],[data-gkick],[data-codun],[data-tinv],[data-toff],[data-trem],[data-tact],[data-alab],[data-soul],[data-ssel],[data-scomb],[data-asel],[data-aspot],[data-wclaim],[data-dclaim],[data-ftab],[data-gcomb],[data-gin],[data-gout],[data-forge],[data-ach],[data-tutskip],#gwin-close,#chat-min,#create-btn,#create-back,#boss-btn,#town-btn,#auto-btn,#mute-btn,#modal-close,#btn-exit');
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
    S.settings.auto = false;
    writeSlot(slot, S);
    return startGame(slot);
  }
  if (t.id === 'btn-exit') { save(); return renderSelect(); }
  if (t.id === 'modal-close') { $('#modal').classList.add('hidden'); $('#modal-body').classList.remove('wide'); if (R) R.npc = null; if (R && R.pendingLogin) { const lg = R.pendingLogin; R.pendingLogin = null; showLogin(lg); } return; }
  if (ds.act === 'full-account') return createFullAccount();
  if (ds.act && ds.act.startsWith('acct-')) return accountAction(ds.act.slice(5));
  if (!S) return;
  if (ds.attr) {
    const n = Math.min(+ds.n, S.pts);
    if (n > 0) { S.attr[ds.attr] += n; S.pts -= n; renderChar(); }
    return;
  }
  if (t.id === 'town-btn') { setTown(!R.inTown); return; }
  if (ds.win) { openWin(ds.win); return; }
  if (t.id === 'gwin-close') { closeWin(); return; }
  if (ds.cast) { if (!e.target.closest('[data-skill]')) { castSkill(ds.cast); R.castCount = (R.castCount || 0) + 1; } return; }
  if (ds.pot) { usePotionNow(ds.pot); return; }
  if (ds.chat) { R.chatTab = ds.chat; for (const b of document.querySelectorAll('.chat-tab[data-chat]')) b.classList.toggle('active', b.dataset.chat === ds.chat); renderLog(); return; }
  if (t.id === 'chat-min') { $('#chat').classList.toggle('min'); t.textContent = $('#chat').classList.contains('min') ? '▴' : '▾'; return; }
  if (ds.dun) { enterDungeon(ds.dun); return; }
  if (ds.tower) { enterTower(ds.tower); return; }
  if (ds.craft) { craft(ds.craft); return; }
  if (ds.soc) { socialAction(ds.soc); return; }
  if (ds.codun) { startCoop(ds.codun); return; }
  if (ds.alab) { R.almaTab = ds.alab; return renderTab(); }
  if (ds.soul) { soulPlace(+ds.soul); return; }
  if (ds.ssel) { const [t2, l2] = ds.ssel.split(':'); R.soulSel = R.soulSel && R.soulSel.t === t2 && R.soulSel.l === +l2 ? null : { t: t2, l: +l2 }; return renderTab(); }
  if (ds.scomb) { const [t2, l2] = ds.scomb.split(':'); soulCombine(t2, +l2); return; }
  if (ds.asel) { R.artSel = R.artSel === ds.asel ? null : ds.asel; return renderTab(); }
  if (ds.aspot) { artPlace(ds.aspot); return; }
  if (ds.wclaim !== undefined) { claimWeekly(+ds.wclaim); return; }
  if (ds.tinv) { Net.soc('tinvite', { name: ds.tinv }); return; }
  if (ds.toff) { if (R.tradeSel.size >= 8) return toast('Até 8 itens por troca.', 'bad'); R.tradeSel.add(ds.toff); tradeSend(); return; }
  if (ds.trem) { R.tradeSel.delete(ds.trem); tradeSend(); return; }
  if (ds.tact) { tradeAction(ds.tact); return; }
  if (ds.pinv) { Net.soc('pinvite', { name: ds.pinv }); return; }
  if (ds.ginv) { Net.soc('ginvite', { name: ds.ginv }); return; }
  if (ds.gkick) { Net.soc('gkick', { user: ds.gkick }); return; }
  if (ds.goexit) { const ex = zoneExits(S.zone)[+ds.goexit]; if (ex && !R.inTown && !R.dungeon) { R.move = { x: ex.x, z: ex.z }; R.mon = null; R.gather = null; } return; }
  if (ds.ftab) { R.forgeTab = ds.ftab; return renderTab(); }
  if (ds.gcomb) { const [k, l] = ds.gcomb.split(':'); combineGem(k, +l); return; }
  if (ds.gin) { const [u, k] = ds.gin.split(':'); socketGem(u, k); return; }
  if (ds.gout) { const [u, i] = ds.gout.split(':'); unsocketGem(u, +i); return; }
  if (ds.forge) { forgeItem(ds.forge); return; }
  if (ds.ach) { S.title = ds.ach === '-' ? '' : ds.ach; renderHeader(); return renderTab(); }
  if (ds.tutskip !== undefined) { S.tut = 99; renderTut(); return; }
  if (ds.dclaim !== undefined) { claimDaily(+ds.dclaim); return; }
  if (ds.spec) { chooseSpec(ds.spec); return; }
  if (ds.skup) { upgradeSkill(ds.skup); return; }
  if (ds.qacc) { acceptQuest(ds.qacc); renderTab(); return; }
  if (ds.qturn) { turnInQuest(ds.qturn); renderTab(); return; }
  if (ds.qdrop) { delete questState().active[ds.qdrop]; renderTab(); return; }
  if (t.id === 'auto-btn') { S.settings.auto = !S.settings.auto; Sfx.play('click'); if (!S.settings.auto) { R.mon = null; } toast(S.settings.auto ? 'Modo automático ligado: o herói caça sozinho.' : 'Modo manual: toque no chão para andar e nos monstros para atacar.'); renderLive(); return; }
  if (t.id === 'mute-btn') { S.settings.muted = !S.settings.muted; Sfx.init(); Sfx.applyVolume(); renderLive(); return; }
  if (ds.npc) { if (R.inTown) { if (Scene.walkToNpc && Scene.walkToNpc(ds.npc)) return; openNpc(ds.npc); } return; }
  if (t.id === 'boss-btn') { if ((S.zoneKills[S.zone] || 0) >= 25) { R.bossFight = true; log('Você desafiou o chefe do mapa!', 'boss'); } return; }
  if (ds.zone) {
    const changed = ds.zone !== S.zone;
    if (changed) { S.zone = ds.zone; R.worldZone = null; R.mon = null; R.respawn = 0.5; R.bossFight = false; log(`Você viajou para ${zoneById(ds.zone).name}.`, 'muted'); }
    if (R.dungeon) exitDungeon(false);
    if (R.inTown) setTown(false); else if (changed) Sfx.play('portal');
    if (R.npc) { R.npc = null; $('#modal').classList.add('hidden'); $('#modal-body').classList.remove('wide'); }
    return renderTab();
  }
  if (ds.tab) { R.tab = ds.tab; Sfx.play('click'); return renderTab(); }
  if (ds.item) { R.sel = ds.item; R.selEq = null; return renderTab(); }
  if (ds.eq) { R.selEq = ds.eq; R.sel = null; if (R.win !== 'inventario') { R.win = null; openWin('inventario'); } else renderTab(); return; }
  if (ds.ref) { R.refSel = ds.ref; return renderTab(); }
  if (ds.toggleSkill) { S.skillOff[ds.toggleSkill] = !S.skillOff[ds.toggleSkill]; renderSkillBar(); return renderTab(); }
  if (ds.skill) { e.stopPropagation(); if (S.lvl >= CLASSES[S.cls].skills.find((s) => s.id === ds.skill).lvl) { S.skillOff[ds.skill] = !S.skillOff[ds.skill]; renderSkillBar(); if (R.tab === 'habilidades') renderTab(); } return; }
  if (ds.buy) { buyShop(ds.buy, +ds.n); return; }
  if (ds.buyOld) {
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
    case 'to-refine': R.refSel = R.sel || (R.selEq && S.equip[R.selEq].uid); R.win = null; openWin('refino'); break;
    case 'refine': doRefine(); break;
    case 'auto-alma': autoSoul(true); autoArts(true); log(`✨ Alma e artefatos montados para ${CLASSES[S.cls].name} (prioridade ${buildWeights().order.slice(0, 2).map((t) => SOUL[t].name).join(' e ')}).`, 'lvl'); Sfx.play('refineOk'); renderTab(); break;
    case 'consagrar': consecrate(R.win === 'refino' ? R.refSel : (R.sel || (R.selEq && S.equip[R.selEq] && S.equip[R.selEq].uid))); break;
    case 'equip-best': equipBest(); break;
    case 'meter-reset': R.meter = null; renderTab(); break;
    case 'acct-login': accountAction('login'); break;
    case 'acct-register': accountAction('register'); break;
    case 'acct-logout': accountAction('logout'); break;
    case 'acct-import': accountAction('import'); break;
    case 'rebirth': rebirth(); break;
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
  if (k === 'quality') Scene.setQuality && Scene.setQuality(v);
  if (k === 'sfxVol' || k === 'musVol') Sfx.applyVolume();
  if (e.target.type === 'range') e.target.previousElementSibling.textContent = v + '%';
});

window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

renderSelect();

// ---------- chat, teclado e minimapa ----------
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'chat-form') return;
  e.preventDefault();
  const inp = document.getElementById('chat-input');
  if (S && inp.value.trim()) chatCommand(inp.value);
  inp.value = ''; inp.blur();
});
document.addEventListener('keydown', (e) => {
  if (!S || document.getElementById('screen-game').classList.contains('hidden')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '6') { const sk = CLASSES[S.cls].skills[+k - 1]; if (sk) castSkill(sk.id); return; }
  const wins = { c: 'personagem', i: 'inventario', k: 'habilidades', j: 'missoes', m: 'mapas', l: 'conquistas', r: 'ranking', b: 'bestiario', d: 'stats', g: 'social', h: 'alma' };
  if (wins[k]) { openWin(wins[k]); return; }
  if (k === 'q') usePotionNow('hp');
  else if (k === 'e') usePotionNow('mp');
  else if (k === 'escape') { if (!$('#modal').classList.contains('hidden')) { $('#modal').classList.add('hidden'); $('#modal-body').classList.remove('wide'); R.npc = null; } else closeWin(); }
  else if (k === 'enter') { e.preventDefault(); document.getElementById('chat-input').focus(); }
  else if (k === ' ') { e.preventDefault(); document.getElementById('auto-btn').click(); }
});
document.addEventListener('pointerdown', (e) => {
  const mm = e.target.closest('#minimap'); if (!mm || !S || R.inTown) return;
  const r = mm.getBoundingClientRect(), C = r.width / 2, k = (C - 6 * r.width / mm.width) / 36;
  window.gameOrder({ type: 'move', x: (e.clientX - r.left - C) / k, z: (e.clientY - r.top - C) / k });
});

// ---------- chat e avisos vindos do servidor ----------
if (typeof Net !== 'undefined') {
  const CLS_COLOR = { gladiador: '#ff8a5a', engenheiro: '#b8c4d8', cacadora: '#8ae07a', lanceiro: '#c090ff', paladino: '#ffe070', valquiria: '#9ad0ff', arcanista: '#d0a0ff', cleriga: '#fff0c0' };
  Net.onChat = (m) => { if (!S || !R) return; log(`${m.ch === 'zone' ? '<small>[mapa]</small> ' : m.ch === 'party' ? '<small style="color:#80d0ff">[grupo]</small> ' : m.ch === 'guild' ? '<small style="color:#90ff90">[guilda]</small> ' : ''}<b style="color:${CLS_COLOR[m.cls] || '#9ad0ff'}">[${esc(m.from)}]</b> ${esc(m.text)}`, 'chat'); if (R.dirty) renderLog(); };
  Net.onSys = (text) => { if (S && R && R.log) log(`🌐 ${esc(text)}`, 'muted'); };
  Net.onSocial = (m) => {
    if (!S || !R) return;
    if (m.t === 'pinvite') uiConfirm('Convite de grupo', `${m.from} chamou você para o grupo dele.`, 'Entrar').then((y) => { if (y) Net.soc('paccept', { fid: m.fid }); });
    else if (m.t === 'ginvite') uiConfirm('Convite de guilda', `${m.from} convidou você para a guilda ${m.guild}.`, 'Entrar').then((y) => { if (y) Net.soc('gaccept'); });
    else if (m.t === 'pshare') { gainXp(m.xp); S.gold += m.gold; R.shareLog = (R.shareLog || 0) + 1; if (R.shareLog % 5 === 1) log(`👥 Grupo: +${fmt(m.xp)} XP e +${fmt(m.gold)} ouro dos abates de ${esc(m.from)}.`, 'muted'); }
    else if (m.t === 'coop') onCoop(m);
    else if (m.t === 'tinvite') uiConfirm('Pedido de troca', `${m.from} quer trocar itens com você.`, 'Abrir troca').then((y) => { if (y) Net.soc('taccept', { fid: m.fid }); });
    else if (m.t === 'trade') { if (m.trade && R.win !== 'troca') { R.tradeSel = R.tradeSel || new Set(); R.win = null; openWin('troca'); } if (!m.trade) { R.tradeSel = new Set(); R.tradeGold = 0; if (R.win === 'troca') closeWin(); if (m.why) log(`🤝 ${esc(m.why)}`, 'muted'); } }
    else if (m.t === 'tdone') tradeDone(m);
    else if (m.t === 'closed') { if (R.coop && R.dungeon) { R.coop = null; exitDungeon(false); } }
    else if (m.t === 'gcreated') { S.gold = Math.max(0, S.gold - GUILD_COST); log(`🛡️ Guilda <b>${esc(m.name)}</b> fundada! (-${fmt(GUILD_COST)} ouro)`, 'lvl'); toast('Guilda fundada!', 'good'); S.stats.guild = 1; }
    if (R.win === 'social' || R.win === 'troca') renderTab();
    renderPartyHud();
  };
  Net.probe().then((ok) => { if (!ok) return; Net.resume().finally(() => { if (!S || document.getElementById('screen-select').offsetParent) renderSelect(); }); });
}
