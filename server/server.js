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
      db.users[key] = { user, salt, hash: hash(pass, salt), created: Date.now(), saves: [null, null, null] };
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
      for (const u of Object.values(db.users)) for (const s of u.saves) if (s) rows.push({ user: u.user, name: s.name, cls: s.cls, lvl: s.lvl, rebirths: s.rebirths || 0, kills: (s.stats && s.stats.kills) || 0 });
      rows.sort((a, b) => b.rebirths - a.rebirths || b.lvl - a.lvl || b.kills - a.kills);
      return send(res, 200, { list: rows.slice(0, 50) });
    }
    const me = auth(req);
    if (!me || !db.users[me]) return send(res, 401, { erro: 'Faça login.' });
    const U = db.users[me];
    if (url === '/api/me') return send(res, 200, { user: U.user, slots: U.saves.map(summary) });
    const m = url.match(/^\/api\/save\/([0-2])$/);
    if (m) {
      const i = +m[1];
      if (req.method === 'GET') return send(res, 200, { save: U.saves[i] });
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
function roomOf(p) { return p.dun ? null : p.town ? 'town_' + FACTION[p.cls] : p.zone; }
function broadcast(obj, filter) { const msg = JSON.stringify(obj); for (const [ws, p] of clients) if (p.ready && (!filter || filter(p)) && ws.readyState === 1) ws.send(msg); }

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const user = sessions.get(token);
  if (!user) return ws.close(4001, 'login');
  const p = { id: nextId++, user: db.users[user].user, ready: false, last: Date.now(), chatAt: 0 };
  clients.set(ws, p);
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    p.last = Date.now();
    if (m.t === 'state') {
      if (!CLASSES.includes(m.cls)) return;
      Object.assign(p, {
        name: clean(m.name, 16), cls: m.cls, lvl: Math.max(1, Math.min(100, m.lvl | 0)), rb: Math.max(0, m.rb | 0), title: clean(m.title, 30),
        zone: clean(m.zone, 4), town: !!m.town, dun: !!m.dun, x: +m.x || 0, z: +m.z || 0, face: +m.face || 0, moving: !!m.moving, atk: !!m.atk,
        look: m.look && typeof m.look === 'object' ? m.look : {},
      });
      if (!p.ready) { p.ready = true; broadcast({ t: 'sys', text: `${p.name} entrou no mundo.` }, (o) => o !== p); }
    } else if (m.t === 'chat' && p.ready) {
      const text = clean(m.text, 120);
      if (!text || Date.now() - p.chatAt < 1200) return;
      p.chatAt = Date.now();
      const ch = m.ch === 'zone' ? 'zone' : 'global', room = roomOf(p);
      broadcast({ t: 'chat', ch, from: p.name, cls: p.cls, text }, (o) => ch === 'global' || roomOf(o) === room);
    }
  });
  ws.on('close', () => { if (p.ready) broadcast({ t: 'sys', text: `${p.name} saiu.` }, (o) => o !== p); clients.delete(ws); });
});

// envia a cada jogador os outros jogadores da mesma sala (5×/s)
setInterval(() => {
  const now = Date.now();
  for (const [ws, p] of clients) {
    if (now - p.last > 60e3) { ws.terminate(); continue; }
    if (!p.ready || ws.readyState !== 1) continue;
    const room = roomOf(p);
    const list = [];
    if (room) for (const o of clients.values()) if (o !== p && o.ready && roomOf(o) === room) {
      list.push({ id: o.id, name: o.name, cls: o.cls, lvl: o.lvl, rb: o.rb, title: o.title, x: o.x, z: o.z, face: o.face, moving: o.moving, atk: o.atk, look: o.look });
      if (list.length >= 40) break;
    }
    ws.send(JSON.stringify({ t: 'players', list, online: clients.size }));
  }
}, 200);

server.listen(PORT, () => console.log(`Crônicas de Valdária rodando em http://localhost:${PORT} (dados em ${DATA})`));
process.on('SIGTERM', () => { if (dirty) fs.writeFileSync(DB_FILE, JSON.stringify(db)); process.exit(0); });
