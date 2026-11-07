// ============================================================
//  Crônicas de Valdária — conexão com o servidor (multiplayer)
//  Contas, salvamento na nuvem, presença em tempo real, chat e ranking.
//  Sem servidor (ex.: link do claude.ai ou arquivo local), o jogo segue offline.
// ============================================================
const Net = (() => {
  const st = { available: false, token: null, user: null, slots: [null, null, null], ws: null, wantWs: false, others: new Map(), online: 0, timers: {} };
  try { st.token = localStorage.getItem('valdaria_token'); } catch (e) { /* sem armazenamento */ }
  const store = () => { try { if (st.token) localStorage.setItem('valdaria_token', st.token); else localStorage.removeItem('valdaria_token'); } catch (e) {} };
  const headers = () => ({ 'Content-Type': 'application/json', ...(st.token ? { Authorization: 'Bearer ' + st.token } : {}) });

  async function api(p, opts = {}) {
    const r = await fetch(p, { ...opts, headers: headers(), cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro de conexão.');
    return j;
  }
  // existe servidor do jogo neste endereço?
  async function probe() {
    if (location.protocol === 'file:' || !window.VALDARIA_SERVER) return false; // só o servidor do jogo marca a página
    try { const r = await fetch('api/ping', { cache: 'no-store' }); st.available = r.ok && !!(await r.json()).ok; } catch (e) { st.available = false; }
    return st.available;
  }
  async function pullSlots() { for (let i = 0; i < 3; i++) st.slots[i] = (await api('api/save/' + i)).save || null; }
  async function resume() {
    if (!st.token || !st.available) return false;
    try { const me = await api('api/me'); st.user = me.user; await pullSlots(); return true; } catch (e) { st.token = null; st.user = null; store(); return false; }
  }
  async function login(user, pass, register) {
    const r = await api(register ? 'api/register' : 'api/login', { method: 'POST', body: JSON.stringify({ user, pass }) });
    st.token = r.token; st.user = r.user; store();
    await pullSlots();
  }
  function logout() { flush(); st.token = null; st.user = null; st.slots = [null, null, null]; store(); disconnect(); }

  // salvamento na nuvem (agrupa as gravações para não sobrecarregar o servidor)
  function queueSave(i, s) {
    st.slots[i] = JSON.parse(JSON.stringify(s));
    clearTimeout(st.timers[i]);
    st.timers[i] = setTimeout(() => { delete st.timers[i]; pushSave(i); }, 8000);
  }
  async function pushSave(i, keepalive) {
    if (!st.token) return;
    const s = st.slots[i];
    try {
      if (s) await fetch('api/save/' + i, { method: 'PUT', keepalive: !!keepalive, headers: headers(), body: JSON.stringify(s) });
      else await fetch('api/save/' + i, { method: 'DELETE', keepalive: !!keepalive, headers: headers() });
    } catch (e) { /* tenta de novo na próxima gravação */ }
  }
  function flush() { for (const i of Object.keys(st.timers)) { clearTimeout(st.timers[i]); delete st.timers[i]; pushSave(+i, true); } }
  function setSlot(i, s) { st.slots[i] = s ? JSON.parse(JSON.stringify(s)) : null; clearTimeout(st.timers[i]); delete st.timers[i]; return pushSave(i); }

  // tempo real
  function connect() {
    if (!st.token || st.ws) return;
    st.wantWs = true;
    const base = location.pathname.replace(/[^/]*$/, '');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${base}ws?token=${st.token}`);
    st.ws = ws;
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === 'players') {
        st.online = m.online;
        const now = Date.now(), seen = new Set();
        for (const p of m.list) { seen.add(p.id); st.others.set(p.id, Object.assign(st.others.get(p.id) || {}, p, { at: now })); }
        for (const id of [...st.others.keys()]) if (!seen.has(id)) st.others.delete(id);
      } else if (m.t === 'chat' && api.onChat) api.onChat(m);
      else if (m.t === 'sys' && api.onSys) api.onSys(m.text);
    };
    ws.onclose = () => { st.ws = null; st.others.clear(); if (st.wantWs && st.token) setTimeout(connect, 3000); };
  }
  function disconnect() { st.wantWs = false; if (st.ws) st.ws.close(); st.ws = null; st.others.clear(); }
  const open = () => st.ws && st.ws.readyState === 1;
  function sendState(s) { if (open()) st.ws.send(JSON.stringify({ t: 'state', ...s })); }
  function chat(text, ch) { if (!open()) return false; st.ws.send(JSON.stringify({ t: 'chat', text, ch })); return true; }
  async function ranking() { return (await api('api/ranking')).list; }

  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  return Object.assign(api, { st, probe, resume, login, logout, queueSave, setSlot, flush, connect, disconnect, sendState, chat, ranking, isOnline: () => !!st.user, connected: open });
})();
