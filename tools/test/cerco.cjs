// Teste do fim do Cerco da Coroa: liga o servidor com o Cerco aberto (GW_FORCE=1), um clã marca pontos,
// depois religa com o Cerco fechado e confere se o clã virou Rei da Semana com +10% de XP e drop.
// Uso: node tools/test/cerco.cjs   (precisa de: cd server && npm install)
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WebSocket = require(path.resolve(__dirname, '../../server/node_modules/ws'));
const ROOT = path.resolve(__dirname, '../..');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cerco-')), port = 19000 + Math.floor(Math.random() * 900);
const start = (force) => new Promise((res) => { const p = spawn('node', [path.join(ROOT, 'server/server.js')], { env: { ...process.env, PORT: port, DATA_DIR: data, GW_FORCE: force ? '1' : '0', EVENT_TZ: 'UTC' } }); p.stdout.on('data', (d) => { if (/rodando/.test(d)) res(p); }); });
const api = async (u, body, tok) => (await fetch(`http://localhost:${port}/api/${u}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body && JSON.stringify(body) })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(tok) {
  const ws = new WebSocket(`ws://localhost:${port}/ws?token=${tok}`), msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  const send = (o) => ws.send(JSON.stringify(o));
  return new Promise((r) => ws.on('open', () => r({ ws, msgs, send, last: (t) => [...msgs].reverse().find((m) => m.t === t) })));
}
(async () => {
  const out = [], ok = (n, c, i = '') => out.push(`${c ? '✅' : '❌'} ${n}${i ? ' — ' + i : ''}`);
  // ainda não é domingo 17h no relógio real (EVENT_TZ=UTC) só importa quando GW_FORCE=0; para o fim, basta não estar forçado
  let srv = await start(true);
  const r = await api('register', { user: 'Rei', pass: 'segredo123' });
  let c = await client(r.token);
  c.send({ t: 'state', name: 'Monarca', cls: 'gladiador', lvl: 60, zone: 'z5' }); await sleep(300);
  c.send({ t: 'gcreate', name: 'Coroa Dourada' }); await sleep(300);
  c.send({ t: 'state', name: 'Monarca', cls: 'gladiador', lvl: 60, zone: 'gw' }); await sleep(300);
  for (let i = 0; i < 4; i++) c.send({ t: 'gwscore', k: 'c' });
  await sleep(5600);
  const w1 = c.last('wk');
  ok('Placar do Cerco conta os cristais', !!w1 && w1.gw === true && w1.mine === 200, JSON.stringify(w1 && w1.board));
  c.ws.close(); srv.kill(); await sleep(2500); // dá tempo de gravar o banco
  srv = await start(false);
  c = await client(r.token);
  c.send({ t: 'state', name: 'Monarca', cls: 'gladiador', lvl: 60, zone: 'z5' });
  await sleep(5600);
  const w2 = c.last('wk');
  const realSunday = new Date().getUTCDay() === 0 && new Date().getUTCHours() === 17;
  ok('Cerco fechado vira Rei da Semana com +10%', realSunday || (!!w2 && w2.gw === false && w2.king === 'Coroa Dourada' && w2.gwB === 10 && w2.gwRank === 1), JSON.stringify(w2 && { gw: w2.gw, king: w2.king, gwB: w2.gwB }));
  c.ws.close(); srv.kill();
  console.log(out.join('\n'));
  process.exit(out.some((l) => l.startsWith('❌')) ? 1 : 0);
})();
