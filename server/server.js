// ============================================================
//  Crônicas de Valdária — servidor
//  Serve o jogo, contas, salvamento na nuvem, ranking, presença
//  em tempo real (outros jogadores no mapa) e chat.
//  Uso: node server/server.js   (PORT=8080, DATA_DIR=server/data)
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PORT = +process.env.PORT || 8080;
const MAX_SAVE = 600 * 1024;
const CLASSES = ['gladiador', 'engenheiro', 'cacadora', 'lanceiro', 'paladino', 'valquiria', 'arcanista', 'cleriga'];
const PK_ZONES = new Set(['z8', 'z9', 'z10', 'b4', 'e1']), PK_MIN = 40; // PK só nesses mapas, a partir do nível 40, com o Modo PK ligado
const FACTION = { gladiador: 'ferro', engenheiro: 'ferro', cacadora: 'ferro', lanceiro: 'ferro', paladino: 'luz', valquiria: 'luz', arcanista: 'luz', cleriga: 'luz' };

// ---------- banco de dados em arquivo JSON (troque por PostgreSQL quando crescer) ----------
fs.mkdirSync(DATA, { recursive: true });
const DB_FILE = path.join(DATA, 'db.json');
let db = { users: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { /* banco novo */ }
let dirty = false;
function persist() { dirty = true; }
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE); // troca atômica: não corrompe se o servidor cair no meio
}, 2000);

db.guilds = db.guilds || {};
db.gw = db.gw || { cur: null, result: null };   // Cerco da Coroa (guerra de clãs aos domingos)
db.sod = db.sod || { week: null, best: null, prev: null }; // Arena da Sobrevivência (recorde semanal de grupo)

// ---------- relógio dos eventos semanais (horário de Brasília) ----------
const TZ = process.env.EVENT_TZ || 'America/Sao_Paulo';
function tzParts(t = Date.now()) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const o = {}; for (const p of f.formatToParts(new Date(t))) o[p.type] = p.value;
  return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
}
// Cerco: domingo das 17h às 18h (GW_FORCE=1 deixa aberto, para testes)
function gwState(t = Date.now()) {
  const p = tzParts(t), active = process.env.GW_FORCE === '1' || (p.wd === 0 && p.h === 17);
  return { active, id: `${p.y}-${p.mo}-${p.d}`, endsIn: active ? (60 - p.mi) * 60000 : 0 };
}
function weekKey(t = Date.now()) { const p = tzParts(t); const dt = Date.UTC(p.y, p.mo - 1, p.d) / 864e5; return Math.floor((dt + 3) / 7); } // semana que vira na segunda
// sessões ficam no banco (sobrevivem a reinícios) e valem 30 dias
db.tokens = db.tokens || {};
const sessions = { get: (t) => { const s = t && db.tokens[t]; if (!s) return null; if (s.exp < Date.now()) { delete db.tokens[t]; persist(); return null; } return s.user; } };
const hash = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
function newToken(user) { const t = crypto.randomBytes(24).toString('hex'); db.tokens[t] = { user, exp: Date.now() + 30 * 864e5 }; persist(); return t; }
function auth(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return sessions.get(t) || null;
}

// ---------- limites simples contra abuso ----------
const hits = new Map();
function limited(key, max, ms) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((x) => now - x < ms);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}

// ---------- utilidades HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_SAVE) { reject(new Error('grande demais')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
  });
}
function serveStatic(req, res) {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = path.join(ROOT, u);
  // só arquivos do jogo: nada da pasta do servidor, de dados ou ocultos
  if (!f.startsWith(ROOT) || f.startsWith(path.join(ROOT, 'server')) || /\/\.|node_modules|\/build\//.test(f) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('não encontrado');
  }
  const ext = path.extname(f);
  if (u === '/index.html') { // marca a página: o jogo sabe que há servidor e entra no modo online
    const html = fs.readFileSync(f, 'utf8').replace('</head>', '<script>window.VALDARIA_SERVER = true;</script>\n</head>');
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' }); return res.end(html);
  }
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.glb' || ext === '.png' ? 'public, max-age=86400' : 'no-cache' });
  fs.createReadStream(f).pipe(res);
}

// valida o essencial de um save (o cliente é a fonte da verdade por enquanto)
function validSave(s) {
  return s && typeof s === 'object' && CLASSES.includes(s.cls) && Number.isInteger(s.lvl) && s.lvl >= 1 && s.lvl <= 100
    && typeof s.name === 'string' && s.name.length <= 16 && s.equip && Array.isArray(s.inv) && s.inv.length <= 80;
}
function summary(s) { return s ? { name: s.name, cls: s.cls, lvl: s.lvl, rebirths: s.rebirths || 0 } : null; }

// ---------- API ----------
async function api(req, res) {
  const url = req.url.split('?')[0], ip = req.socket.remoteAddress;
  try {
    if (url === '/api/ping') return send(res, 200, { ok: true, online: clients.size });
    if (url === '/api/register' && req.method === 'POST') {
      if (limited('reg:' + ip, 5, 3600e3)) return send(res, 429, { erro: 'Muitas contas criadas. Tente mais tarde.' });
      const { user, pass } = await body(req);
      if (!/^[A-Za-z0-9_]{3,16}$/.test(user || '')) return send(res, 400, { erro: 'Usuário: 3 a 16 letras, números ou _.' });
      if (typeof pass !== 'string' || pass.length < 6 || pass.length > 64) return send(res, 400, { erro: 'Senha: de 6 a 64 caracteres.' });
      const key = user.toLowerCase();
      if (db.users[key]) return send(res, 409, { erro: 'Esse usuário já existe.' });
      const salt = crypto.randomBytes(16).toString('hex');
      db.users[key] = { user, salt, hash: hash(pass, salt), created: Date.now(), saves: [null, null, null, null, null] };
      persist();
      return send(res, 200, { token: newToken(key), user });
    }
    if (url === '/api/login' && req.method === 'POST') {
      if (limited('login:' + ip, 15, 600e3)) return send(res, 429, { erro: 'Muitas tentativas. Espere alguns minutos.' });
      const { user, pass } = await body(req);
      const u = db.users[(user || '').toLowerCase()];
      if (!u || typeof pass !== 'string' || !crypto.timingSafeEqual(Buffer.from(hash(pass, u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) return send(res, 401, { erro: 'Usuário ou senha incorretos.' });
      return send(res, 200, { token: newToken((user || '').toLowerCase()), user: u.user });
    }
    if (url === '/api/ranking') {
      const rows = [];
      for (const u of Object.values(db.users)) for (const s of u.saves) if (s) rows.push({ user: u.user, name: s.name, cls: s.cls, lvl: s.lvl, rebirths: s.rebirths || 0, kills: (s.stats && s.stats.kills) || 0, guild: u.guild && db.guilds[u.guild] ? db.guilds[u.guild].name : '', honor: u.honor || 0 });
      rows.sort((a, b) => b.rebirths - a.rebirths || b.lvl - a.lvl || b.kills - a.kills);
      return send(res, 200, { list: rows.slice(0, 50) });
    }
    const me = auth(req);
    if (!me || !db.users[me]) return send(res, 401, { erro: 'Faça login.' });
    const U = db.users[me];
    while (U.saves.length < 5) U.saves.push(null); // contas antigas tinham 3 espaços
    if (url === '/api/me') return send(res, 200, { user: U.user, slots: U.saves.map(summary) });
    const m = url.match(/^\/api\/save\/([0-4])$/); // 5 espaços de herói
    if (m) {
      const i = +m[1];
      if (req.method === 'GET') return send(res, 200, { save: U.saves[i] || null });
      if (req.method === 'PUT') {
        if (limited('save:' + me, 30, 60e3)) return send(res, 429, { erro: 'Salvando rápido demais.' });
        const s = await body(req);
        if (!validSave(s)) return send(res, 400, { erro: 'Save inválido.' });
        U.saves[i] = s; persist();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') { U.saves[i] = null; persist(); return send(res, 200, { ok: true }); }
    }
    return send(res, 404, { erro: 'Rota desconhecida.' });
  } catch (e) {
    return send(res, 400, { erro: 'Pedido inválido.' });
  }
}

const server = http.createServer((req, res) => (req.url.startsWith('/api/') ? api(req, res) : serveStatic(req, res)));

// ---------- tempo real: presença e chat ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const clients = new Map(); // ws -> estado do jogador
let nextId = 1;
const clean = (t, n) => String(t || '').replace(/[<>]/g, '').slice(0, n).trim();
function roomOf(p) { return p.dun ? (p.coop && p.party ? 'coop_' + p.party : null) : p.town ? 'town_' + FACTION[p.cls] : p.zone; }
const sendTo = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const byName = (name) => { const n = String(name || '').toLowerCase(); for (const [ws, o] of clients) if (o.ready && o.name && o.name.toLowerCase() === n) return [ws, o]; return [null, null]; };

// ---------- grupos (em memória, até 4 jogadores) ----------
const parties = new Map(); let nextParty = 1;
function partyOf(p) { return p.party ? parties.get(p.party) : null; }
function leaveParty(p) {
  const pt = partyOf(p); p.party = null; if (!pt) return;
  pt.members.delete(p);
  if (pt.members.size < 2) { for (const o of pt.members) { o.party = null; sendTo(o.ws, { t: 'party', party: null }); } parties.delete(pt.id); }
  else { if (pt.leader === p) pt.leader = [...pt.members][0]; for (const o of pt.members) sendTo(o.ws, { t: 'sys', text: `${p.name} saiu do grupo.` }); }
  sendTo(p.ws, { t: 'party', party: null });
}
function partyView(pt) { return { leader: pt.leader.name, members: [...pt.members].map((o) => ({ id: o.id, name: o.name, cls: o.cls, lvl: o.lvl, hp: o.hp, zone: o.zone, town: o.town, dun: o.dun })) }; }

// ---------- guildas (salvas no banco) ----------
const gkey = (n) => n.toLowerCase().replace(/\s+/g, ' ').trim();
function guildView(k) {
  const g = db.guilds[k]; if (!g) return null;
  const online = new Map(); for (const o of clients.values()) if (o.ready) online.set(o.key, o);
  return { name: g.name, owner: db.users[g.owner] ? db.users[g.owner].user : '', created: g.created,
    members: g.members.filter((u) => db.users[u]).map((u) => { const U = db.users[u], o = online.get(u); return { user: U.user, key: u, name: o ? o.name : (U.lastName || U.user), lvl: o ? o.lvl : (U.lastLvl || 0), cls: o ? o.cls : U.lastCls, online: !!o, owner: u === g.owner }; }) };
}
function pushGuild(k) { const v = guildView(k); for (const [ws, o] of clients) if (o.key && db.users[o.key] && db.users[o.key].guild === k) sendTo(ws, { t: 'guild', guild: v }); }
function leaveGuild(key) {
  const U = db.users[key], k = U && U.guild, g = k && db.guilds[k]; if (!g) return;
  g.members = g.members.filter((u) => u !== key); U.guild = null;
  if (!g.members.length) delete db.guilds[k];
  else { if (g.owner === key) g.owner = g.members[0]; pushGuild(k); }
  persist();
}

function broadcast(obj, filter) { const msg = JSON.stringify(obj); for (const [ws, p] of clients) if (p.ready && (!filter || filter(p)) && ws.readyState === 1) ws.send(msg); }

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const user = sessions.get(token);
  if (!user) return ws.close(4001, 'login');
  const p = { id: nextId++, user: db.users[user].user, key: user, ws, ready: false, last: Date.now(), chatAt: 0, hp: 1 };
  clients.set(ws, p);
  const U = db.users[user];
  if (U.guild && !db.guilds[U.guild]) U.guild = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    p.last = Date.now();
    if (m.t === 'state') {
      if (!CLASSES.includes(m.cls)) return;
      Object.assign(p, {
        name: clean(m.name, 16), cls: m.cls, lvl: Math.max(1, Math.min(100, m.lvl | 0)), rb: Math.max(0, m.rb | 0), title: clean(m.title, 30),
        zone: clean(m.zone, 4), town: !!m.town, dun: !!m.dun, x: +m.x || 0, z: +m.z || 0, face: +m.face || 0, moving: !!m.moving, atk: !!m.atk,
        coop: !!m.coop, pk: !!m.pk, prot: !!m.prot, pd: Math.max(0, Math.min(1e6, +m.pd || 0)), pe: Math.max(0, Math.min(0.6, +m.pe || 0)), look: m.look && typeof m.look === 'object' ? m.look : {}, hp: Math.max(0, Math.min(1, +m.hp || 0)),
      });
      if (U.lastName !== p.name || U.lastLvl !== p.lvl) { U.lastName = p.name; U.lastLvl = p.lvl; U.lastCls = p.cls; persist(); }
      if (!p.ready) {
        p.ready = true; broadcast({ t: 'sys', text: `${p.name} entrou no mundo.` }, (o) => o !== p);
        if (U.guild) { pushGuild(U.guild); } else sendTo(ws, { t: 'guild', guild: null });
      }
    } else if (m.t === 'chat' && p.ready) {
      const text = clean(m.text, 120);
      if (!text || Date.now() - p.chatAt < 1200) return;
      p.chatAt = Date.now();
      const ch = ['zone', 'party', 'guild'].includes(m.ch) ? m.ch : 'global', room = roomOf(p), pt = partyOf(p);
      if (ch === 'party' && !pt) return sendTo(ws, { t: 'sys', text: 'Você não está em um grupo.' });
      if (ch === 'guild' && !U.guild) return sendTo(ws, { t: 'sys', text: 'Você não está em uma guilda.' });
      broadcast({ t: 'chat', ch, from: p.name, cls: p.cls, text }, (o) => ch === 'global' || (ch === 'zone' && roomOf(o) === room) || (ch === 'party' && pt && pt.members.has(o)) || (ch === 'guild' && db.users[o.key] && db.users[o.key].guild === U.guild));
    } else if (typeof m.t === 'string' && /^(pinvite|paccept|pleave|pshare|gcreate|ginvite|gaccept|gleave|gkick|crelay|tinvite|taccept|toffer|tlock|tconfirm|tcancel|pvphit|pvpdead|gwscore|sodscore)$/.test(m.t)) {
      const lk = m.t === 'pshare' ? ['sh:', 30] : m.t === 'crelay' ? (['start', 'end', 'leave'].includes(m.k) ? ['coe:', 30] : ['co:', 450]) : m.t[0] === 't' ? ['tr:', 60] : m.t.startsWith('pvp') ? ['pv:', 60] : m.t === 'gwscore' ? ['gw:', 80] : ['soc:', 20];
      if (!p.ready || limited(lk[0] + p.key, lk[1], 10e3)) return;
      social(ws, p, U, m);
    }
  });
  ws.on('close', () => { endTrade(p, 'O outro jogador saiu.'); leaveParty(p); if (U.guild) setTimeout(() => pushGuild(U.guild), 50); if (p.ready) broadcast({ t: 'sys', text: `${p.name} saiu.` }, (o) => o !== p); clients.delete(ws); });
});

const guildOf = (o) => (o && db.users[o.key] ? db.users[o.key].guild || null : null);
function gwPk(a, b) { // na Fortaleza durante o Cerco, clãs diferentes lutam sem precisar do Modo PK
  const ga = guildOf(a), gb = guildOf(b);
  return a.zone === 'gw' && b.zone === 'gw' && gwState().active && ga && gb && ga !== gb && !b.prot;
}
function canPk(a, b) {
  if (a && b && a !== b && a.ready && b.ready && gwPk(a, b) && roomOf(a) === roomOf(b) && Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0)) <= 11) return true;
  if (!a || !b || a === b || !a.ready || !b.ready || !a.pk || !b.pk || b.prot) return false;
  if (a.town || b.town || a.dun || b.dun || !PK_ZONES.has(a.zone) || roomOf(a) !== roomOf(b)) return false;
  if ((a.lvl || 0) < PK_MIN || (b.lvl || 0) < PK_MIN) return false;
  if (a.party && a.party === b.party) return false;
  const ga = db.users[a.key] && db.users[a.key].guild; if (ga && db.users[b.key] && db.users[b.key].guild === ga) return false;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0)) <= 11;
}

// ---------- Cerco da Coroa e Arena: pontos, resultado e bônus da semana ----------
function gwRoll() { // começa um Cerco novo ou fecha o que acabou
  const g = gwState();
  if (g.active && (!db.gw.cur || db.gw.cur.id !== g.id || db.gw.cur.done)) { if (!db.gw.cur || db.gw.cur.id !== g.id) { db.gw.cur = { id: g.id, scores: {} }; persist(); broadcast({ t: 'sys', text: '🏰 O Cerco da Coroa começou! Guildas, à Fortaleza da Coroa!' }); } }
  if (!g.active && db.gw.cur && !db.gw.cur.done) {
    const top = Object.entries(db.gw.cur.scores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).filter((k) => db.guilds[k]);
    db.gw.result = { id: db.gw.cur.id, top, scores: db.gw.cur.scores, at: Date.now() }; db.gw.cur.done = true; persist();
    if (top[0]) broadcast({ t: 'sys', text: `👑 ${db.guilds[top[0]].name} é o Rei da Semana! (+10% de XP e drop para o clã)` });
  }
}
function gwAdd(p, pts) { gwRoll(); const k = guildOf(p); if (!k || !db.gw.cur || db.gw.cur.done) return; db.gw.cur.scores[k] = (db.gw.cur.scores[k] || 0) + pts; persist(); }
function sodRoll() { const w = weekKey(); if (db.sod.week !== w) { db.sod.prev = db.sod.best ? { week: db.sod.week, ...db.sod.best } : null; db.sod.week = w; db.sod.best = null; persist(); } }
function weeklyBonus(p) {
  const k = guildOf(p), top = (db.gw.result && db.gw.result.top) || [], i = k ? top.indexOf(k) : -1;
  return { gwB: [10, 6, 3][i] || 0, gwRank: i + 1, sod: db.sod.prev && db.sod.prev.members.includes(p.key) ? 2 : 0 };
}
function gwBoard() { const sc = (db.gw.cur && !db.gw.cur.done && db.gw.cur.scores) || {}; return Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ name: db.guilds[k] ? db.guilds[k].name : '?', pts: v })); }
setInterval(() => { // a cada 5 s: fecha/abre o Cerco e manda o placar e os bônus
  gwRoll(); sodRoll(); const g = gwState(), board = gwBoard();
  for (const [ws, p] of clients) if (p.ready) sendTo(ws, { t: 'wk', gw: g.active, endsIn: g.endsIn, board, mine: guildOf(p) && db.gw.cur && !db.gw.cur.done ? db.gw.cur.scores[guildOf(p)] || 0 : 0,
    king: db.gw.result && db.gw.result.top[0] && db.guilds[db.gw.result.top[0]] ? db.guilds[db.gw.result.top[0]].name : '', sodBest: db.sod.best ? { rounds: db.sod.best.rounds, names: db.sod.best.names } : null,
    sodPrev: db.sod.prev ? { rounds: db.sod.prev.rounds, names: db.sod.prev.names } : null, ...weeklyBonus(p), guild: guildOf(p) && db.guilds[guildOf(p)] ? db.guilds[guildOf(p)].name : '' });
}, 5000);

// ---------- trocas entre jogadores (o servidor guarda as ofertas e só fecha quando os dois confirmam) ----------
const trades = new Map(); let nextTrade = 1;
const tradeOf = (p) => (p.trade ? trades.get(p.trade) : null);
function tradeView(tr, p) { const me = tr.a === p ? 'a' : 'b', ot = me === 'a' ? 'b' : 'a'; return { with: tr[ot].name, mine: tr.off[me], theirs: tr.off[ot], lockMe: tr.lock[me], lockThem: tr.lock[ot], okMe: tr.ok[me], okThem: tr.ok[ot] }; }
function pushTrade(tr) { for (const x of [tr.a, tr.b]) sendTo(x.ws, { t: 'trade', trade: tradeView(tr, x) }); }
function endTrade(p, why) { const tr = tradeOf(p); if (!tr) return; trades.delete(tr.id); for (const x of [tr.a, tr.b]) { x.trade = null; sendTo(x.ws, { t: 'trade', trade: null, why }); } }
function cleanItem(it) {
  if (!it || typeof it !== 'object' || typeof it.uid !== 'string' || typeof it.name !== 'string') return null;
  const j = JSON.stringify(it); if (j.length > 3000) return null;
  return JSON.parse(j);
}

// convites, grupo, guilda, masmorra em grupo e trocas
function social(ws, p, U, m) {
  const err = (text) => sendTo(ws, { t: 'sys', text });
  if (m.t === 'crelay') { // masmorra em grupo: o líder simula os monstros e os outros mandam os golpes
    const pt = partyOf(p); if (!pt || !['start', 'sync', 'hit', 'kill', 'end', 'leave'].includes(m.k)) return;
    const raw = JSON.stringify(m.d || {}); if (raw.length > 12000) return;
    // vai para todo o grupo (cada um ignora o que não é para ele): assim quem acabou de entrar não perde nada, nem o fim
    for (const o of pt.members) if (o !== p) { if (m.k === 'hit' && o !== pt.leader) continue; sendTo(o.ws, { t: 'coop', k: m.k, d: m.d, from: p.name, fid: p.id }); }
    return;
  }
  if (m.t === 'pvphit') { // golpe de um jogador em outro: o servidor confere as regras do PK antes de repassar
    let t = null, tw = null; for (const [w2, o] of clients) if (o.id === m.id) { t = o; tw = w2; }
    if (!canPk(p, t)) return;
    p.hits = p.hits || {}; p.hits[t.id] = Date.now();
    return sendTo(tw, { t: 'pvphit', from: p.name, fid: p.id, dmg: Math.max(1, Math.min(1e6, Math.round(+m.dmg || 0))), crit: !!m.crit });
  }
  if (m.t === 'pvpdead') { // quem morreu avisa; o servidor dá a Honra a quem bateu nos últimos 15 s
    let k = null, kw = null; for (const [w2, o] of clients) if (o.id === m.by) { k = o; kw = w2; }
    if (!k || !k.hits || !(k.hits[p.id] > Date.now() - 15000)) return;
    delete k.hits[p.id];
    const KU = db.users[k.key]; KU.honor = (KU.honor || 0) + 1; persist();
    sendTo(kw, { t: 'pvpkill', name: p.name, honor: KU.honor });
    broadcast({ t: 'sys', text: `⚔️ ${k.name} derrotou ${p.name} em combate!` }, (o) => roomOf(o) === roomOf(p));
    if (p.zone === 'gw') gwAdd(k, 20);
    return;
  }
  if (m.t === 'gwscore') { // abate na Fortaleza durante o Cerco: cristal 50, monstro 1
    if (p.zone !== 'gw' || !gwState().active || !guildOf(p)) return;
    return gwAdd(p, m.k === 'c' ? 50 : 1);
  }
  if (m.t === 'sodscore') { // o líder do grupo manda o resultado da Arena; vale o maior da semana
    const pt = partyOf(p); if (!pt || pt.leader !== p || pt.members.size < 2) return;
    const rounds = Math.max(0, Math.min(200, m.rounds | 0)); sodRoll();
    if (!db.sod.best || rounds > db.sod.best.rounds) {
      db.sod.best = { rounds, members: [...pt.members].map((o) => o.key), names: [...pt.members].map((o) => o.name), at: Date.now() }; persist();
      broadcast({ t: 'sys', text: `🏟️ Novo recorde da Arena da Sobrevivência: ${rounds} rodadas (${db.sod.best.names.join(', ')})!` });
    }
    return;
  }
  if (m.t === 'tinvite') {
    const [tw, t] = byName(m.name); if (!t || t === p) return err('Jogador não encontrado online.');
    if (p.trade || t.trade) return err('Alguém já está em uma troca.');
    t.tinv = p.id; sendTo(tw, { t: 'tinvite', from: p.name, fid: p.id }); return err(`Pedido de troca enviado para ${t.name}.`);
  }
  if (m.t === 'taccept') {
    if (!m.fid || p.tinv !== m.fid) return; p.tinv = null;
    let a = null; for (const o of clients.values()) if (o.id === m.fid) a = o;
    if (!a || a.trade || p.trade) return err('O pedido de troca expirou.');
    const tr = { id: nextTrade++, a, b: p, off: { a: { items: [], gold: 0 }, b: { items: [], gold: 0 } }, lock: { a: false, b: false }, ok: { a: false, b: false } };
    trades.set(tr.id, tr); a.trade = p.trade = tr.id; return pushTrade(tr);
  }
  const tr = tradeOf(p);
  if (m.t === 'tcancel') return endTrade(p, `${p.name} cancelou a troca.`);
  if (tr && ['toffer', 'tlock', 'tconfirm'].includes(m.t)) {
    const me = tr.a === p ? 'a' : 'b', ot = me === 'a' ? 'b' : 'a';
    if (m.t === 'toffer') {
      if (tr.lock[me]) return;
      const items = (Array.isArray(m.items) ? m.items : []).slice(0, 8).map(cleanItem).filter(Boolean);
      tr.off[me] = { items, gold: Math.max(0, Math.min(1e12, Math.floor(+m.gold || 0))) };
      tr.lock.a = tr.lock.b = false; tr.ok.a = tr.ok.b = false; // mudou a oferta: os dois precisam travar de novo
    } else if (m.t === 'tlock') tr.lock[me] = true;
    else if (m.t === 'tconfirm') {
      if (!tr.lock.a || !tr.lock.b) return;
      tr.ok[me] = true;
      if (tr.ok.a && tr.ok.b) {
        trades.delete(tr.id); tr.a.trade = tr.b.trade = null;
        sendTo(tr.a.ws, { t: 'tdone', give: tr.off.a, get: tr.off.b, with: tr.b.name });
        sendTo(tr.b.ws, { t: 'tdone', give: tr.off.b, get: tr.off.a, with: tr.a.name });
        return;
      }
    }
    return pushTrade(tr);
  }
  if (m.t === 'pinvite') {
    const [tw, t] = byName(m.name); if (!t || t === p) return err('Jogador não encontrado online.');
    const pt = partyOf(p);
    if (pt && pt.members.size >= 4) return err('O grupo está cheio (4).');
    if (t.party) return err(`${t.name} já está em um grupo.`);
    t.pinv = p.id; sendTo(tw, { t: 'pinvite', from: p.name, fid: p.id }); err(`Convite enviado para ${t.name}.`);
  } else if (m.t === 'paccept') {
    if (!m.fid || p.pinv !== m.fid) return; p.pinv = null;
    let inv = null; for (const o of clients.values()) if (o.id === m.fid) inv = o;
    if (!inv || p.party) return err('O convite expirou.');
    let pt = partyOf(inv);
    if (!pt) { pt = { id: nextParty++, leader: inv, members: new Set([inv]) }; parties.set(pt.id, pt); inv.party = pt.id; }
    if (pt.members.size >= 4) return err('O grupo está cheio.');
    pt.members.add(p); p.party = pt.id;
    for (const o of pt.members) sendTo(o.ws, { t: 'sys', text: `${p.name} entrou no grupo.` });
  } else if (m.t === 'pleave') leaveParty(p);
  else if (m.t === 'pshare') { // parte do XP/ouro de um abate vai para quem do grupo está no mesmo mapa
    const pt = partyOf(p); if (!pt) return;
    const xp = Math.max(0, Math.min(5e7, Math.round(+m.xp || 0))), gold = Math.max(0, Math.min(5e7, Math.round(+m.gold || 0))), room = roomOf(p);
    for (const o of pt.members) if (o !== p && roomOf(o) === room) sendTo(o.ws, { t: 'pshare', xp, gold, from: p.name });
  } else if (m.t === 'gcreate') {
    const name = clean(m.name, 20).replace(/\s+/g, ' ');
    if (U.guild) return err('Você já está em uma guilda.');
    if (!/^[A-Za-zÀ-ÿ0-9 ]{3,20}$/.test(name)) return err('Nome da guilda: 3 a 20 letras, números ou espaços.');
    if ((p.lvl || 0) < 20) return err('Precisa de nível 20 para fundar uma guilda.');
    const k = gkey(name); if (db.guilds[k]) return err('Já existe uma guilda com esse nome.');
    db.guilds[k] = { name, owner: p.key, members: [p.key], created: Date.now() }; U.guild = k; persist();
    sendTo(ws, { t: 'gcreated', name }); pushGuild(k);
  } else if (m.t === 'ginvite') {
    const g = U.guild && db.guilds[U.guild]; if (!g) return err('Você não está em uma guilda.');
    if (g.members.length >= 30) return err('A guilda está cheia (30).');
    const [tw, t] = byName(m.name); if (!t || t === p) return err('Jogador não encontrado online.');
    if (db.users[t.key].guild) return err(`${t.name} já tem guilda.`);
    t.ginv = U.guild; sendTo(tw, { t: 'ginvite', from: p.name, guild: g.name }); err(`Convite da guilda enviado para ${t.name}.`);
  } else if (m.t === 'gaccept') {
    const k = p.ginv, g = k && db.guilds[k]; p.ginv = null;
    if (!g || U.guild) return err('O convite expirou.');
    if (g.members.length >= 30) return err('A guilda está cheia.');
    g.members.push(p.key); U.guild = k; persist(); pushGuild(k);
    for (const [w2, o] of clients) if (db.users[o.key] && db.users[o.key].guild === k) sendTo(w2, { t: 'sys', text: `${p.name} entrou na guilda ${g.name}!` });
  } else if (m.t === 'gleave') { const k = U.guild; leaveGuild(p.key); sendTo(ws, { t: 'guild', guild: null }); if (k) pushGuild(k); }
  else if (m.t === 'gkick') {
    const g = U.guild && db.guilds[U.guild]; if (!g || g.owner !== p.key) return err('Só o líder pode expulsar.');
    const k = String(m.user || '').toLowerCase(); if (!g.members.includes(k) || k === p.key) return;
    const gk = U.guild; leaveGuild(k);
    for (const [w2, o] of clients) if (o.key === k) sendTo(w2, { t: 'guild', guild: null });
    pushGuild(gk);
  }
}

// envia a cada jogador os outros jogadores da mesma sala (5×/s)
setInterval(() => {
  const now = Date.now();
  for (const [ws, p] of clients) {
    if (now - p.last > 60e3) { ws.terminate(); continue; }
    if (!p.ready || ws.readyState !== 1) continue;
    const room = roomOf(p);
    const list = [];
    if (room) for (const o of clients.values()) if (o !== p && o.ready && roomOf(o) === room) {
      list.push({ id: o.id, name: o.name, cls: o.cls, lvl: o.lvl, rb: o.rb, title: o.title, x: o.x, z: o.z, face: o.face, moving: o.moving, atk: o.atk, look: o.look, pk: o.pk, prot: o.prot, pd: o.pd, pe: o.pe, hp: o.hp, g: guildOf(o) && db.guilds[guildOf(o)] ? db.guilds[guildOf(o)].name : '' });
      if (list.length >= 40) break;
    }
    const pt = partyOf(p), gk = db.users[p.key] && db.users[p.key].guild;
    let gOn = 0; if (gk) for (const o of clients.values()) if (o.ready && db.users[o.key] && db.users[o.key].guild === gk) gOn++;
    ws.send(JSON.stringify({ t: 'players', list, online: clients.size, party: pt ? partyView(pt) : null, gOn }));
  }
}, 200);

server.listen(PORT, () => console.log(`Crônicas de Valdária rodando em http://localhost:${PORT} (dados em ${DATA})`));
process.on('SIGTERM', () => { if (dirty) fs.writeFileSync(DB_FILE, JSON.stringify(db)); process.exit(0); });
