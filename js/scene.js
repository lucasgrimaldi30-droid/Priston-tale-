// ============================================================
//  Crônicas de Valdária — cena de batalha animada (Canvas 2D)
//  Lê o estado do jogo (S, R) e recebe eventos de combate.
// ============================================================

const Scene2D = (() => {
  let cv = null, ctx = null, W = 600, H = 320, dpr = 1, raf = 0, running = false;
  let lastT = 0, scroll = 0, shake = 0;
  const st = { hero: { atk: null, hurt: -9, cast: -9 }, mon: null, dying: [], fx: [], parts: [], floats: [], timers: [], amb: [] };
  const now = () => performance.now() / 1000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------- cores ----------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  // ---------- aparência dos heróis ----------
  const LOOK = {
    gladiador:  { body: '#7a4a2a', trim: '#b07a3a', pants: '#4a3020', skin: '#e8b890', head: 'mohawk', hair: '#c0402a', bare: true },
    engenheiro: { body: '#7a8494', trim: '#c09a40', pants: '#3a404a', skin: '#f0c8a0', head: 'goggles', hair: '#5a4030' },
    cacadora:   { body: '#3f7a3a', trim: '#a07a40', pants: '#4a3a28', skin: '#f6d0b0', head: 'ponytail', hair: '#e8c060' },
    lanceiro:   { body: '#2f5a9a', trim: '#d0b050', pants: '#2a3048', skin: '#eac0a0', head: 'plume', hair: '#c03030' },
    paladino:   { body: '#d8dce8', trim: '#e0b040', pants: '#6a6e80', skin: '#f0c8a8', head: 'helm', hair: '#8090a0' },
    valquiria:  { body: '#9aa8c8', trim: '#4a70c0', pants: '#5a6488', skin: '#f6d4b8', head: 'winged', hair: '#f0e0a0' },
    arcanista:  { body: '#5a3a9a', trim: '#e0c050', pants: '#3a2a6a', skin: '#f0cca8', head: 'wizard', hair: '#d8d8e8', robe: true },
    cleriga:    { body: '#f0ece0', trim: '#e0b040', pants: '#c8c0a8', skin: '#f6d6bc', head: 'hood', hair: '#f0d080', robe: true },
  };
  const RANGED = { arco: 1, dardo: 1, cajado: 1, cetro: 1 };

  // ---------- aparência dos monstros ----------
  const MON = {
    'Coelho Saltador': ['beast', '#e8dcc8', 'ears'], 'Lesma Verde': ['slime', '#7cc850'], 'Lobo Filhote': ['beast', '#8a8a96'],
    'Rei Javali': ['beast', '#7a4a2a', 'tusks'],
    'Ent Jovem': ['plant', '#6a5030'], 'Aranha da Mata': ['bug', '#4a3a5a'], 'Goblin Ladrão': ['humanoid', '#6aa040', 'ears'],
    'Matriarca Aracnídea': ['bug', '#6a2a7a'],
    'Sapo Venenoso': ['slime', '#4aa850', 'frog'], 'Zumbi do Brejo': ['humanoid', '#7a9a6a'], 'Serpente Lodosa': ['serpent', '#4a6a3a'],
    'Bruxa do Pântano': ['humanoid', '#5a3a6a', 'hat'],
    'Morcego Sombrio': ['flyer', '#3a3a4a'], 'Golem de Rocha': ['golem', '#8a8070'], 'Minerador Maldito': ['skeleton', '#d8d0c0', 'helmet'],
    'Colosso de Ferro': ['golem', '#6a7488'],
    'Escorpião Gigante': ['bug', '#c08040', 'tail'], 'Múmia Errante': ['humanoid', '#d8c8a0', 'wrap'], 'Verme da Areia': ['serpent', '#c0a060'],
    'Faraó Esquecido': ['humanoid', '#3a6aa0', 'crown'],
    'Esqueleto Guerreiro': ['skeleton', '#e0dcd0'], 'Espectro': ['ghost', '#a0c0e0'], 'Ghoul': ['humanoid', '#6a7a6a'],
    'Lich Ancião': ['skeleton', '#8060c0', 'crown'],
    'Yeti': ['golem', '#e8eef8', 'fur'], 'Lobo de Gelo': ['beast', '#b0d0f0'], 'Elemental de Gelo': ['ghost', '#80d0ff'],
    'Dragão Branco': ['dragon', '#e0f0ff'],
    'Diabrete': ['flyer', '#c03030', 'horns'], 'Cão Infernal': ['beast', '#802020', 'flame'], 'Cavaleiro Demônio': ['humanoid', '#501818', 'horns'],
    'Senhor das Chamas': ['golem', '#ff6020', 'flame'],
    'Ciclope': ['humanoid', '#a08060', 'cyclops'], 'Gigante de Pedra': ['golem', '#9a9080'], 'Grifo': ['flyer', '#c0a060', 'beak'],
    'Titã Primordial': ['golem', '#c04020', 'flame'],
    'Horror do Vazio': ['eye', '#5a2a8a'], 'Anjo Caído': ['humanoid', '#303040', 'wings'], 'Devorador': ['slime', '#402060', 'teeth'],
    'Deus do Abismo': ['eye', '#300050', 'crown'],
  };

  // ---------- temas dos mapas ----------
  const THEMES = {
    z1:  { sky: ['#6ab8ec', '#d8f0ff'], far: '#8ab878', mid: '#5f9a4c', g: ['#6ab04a', '#3f7a2c'], deco: 'tree', dc: '#3a7a2a', amb: 'leaf' },
    z2:  { sky: ['#3f6a5a', '#a8d0a0'], far: '#2f5a3a', mid: '#244a2c', g: ['#3a6a2a', '#22401a'], deco: 'pine', dc: '#1a3a1f', amb: 'firefly' },
    z3:  { sky: ['#4a5a50', '#9aa890'], far: '#4a5a48', mid: '#36463a', g: ['#4a5a3a', '#26321f'], deco: 'dead', dc: '#2a2a22', amb: 'bubble' },
    z4:  { sky: ['#0e0e14', '#2e2834'], far: '#26222c', mid: '#332c38', g: ['#4a4048', '#241e22'], deco: 'crystal', dc: '#60c0ff', amb: 'dust', cave: true },
    z5:  { sky: ['#f0a050', '#ffe6a8'], far: '#d89a50', mid: '#c08440', g: ['#e8c070', '#b88a48'], deco: 'cactus', dc: '#5a8a3a', amb: 'sand' },
    z6:  { sky: ['#120e1e', '#342a48'], far: '#241e34', mid: '#302840', g: ['#4a4458', '#221e2c'], deco: 'tomb', dc: '#6a6878', amb: 'wisp' },
    z7:  { sky: ['#8ab0d8', '#f0f8ff'], far: '#c0d2ea', mid: '#dce8f6', g: ['#f2f8ff', '#b8cce4'], deco: 'pine', dc: '#4a6a7a', amb: 'snow' },
    z8:  { sky: ['#2a0606', '#a03010'], far: '#4a1010', mid: '#380c0c', g: ['#3a1a14', '#1a0806'], deco: 'spike', dc: '#1a0a0a', amb: 'ember' },
    z9:  { sky: ['#b89878', '#f0e0c0'], far: '#9a8070', mid: '#786654', g: ['#8a7860', '#5a4a3a'], deco: 'rock', dc: '#6a5a4a', amb: 'dust' },
    z10: { sky: ['#06020f', '#2a1048'], far: '#1a0a30', mid: '#260e3c', g: ['#1a1028', '#08040f'], deco: 'crystal', dc: '#c060ff', amb: 'star' },
  };

  // ---------- desenho básico ----------
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2); }
  function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.abs(r), 0, Math.PI * 2); }
  function limb(x, y, ang, len, w, col, foot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = col; rr(-w / 2, 0, w, len, w / 2); ctx.fill();
    if (foot) { ctx.fillStyle = foot; rr(-w / 2 - 1, len - 5, w + 5, 6, 3); ctx.fill(); }
    ctx.restore();
  }

  // ---------- cenário ----------
  function ridge(off, base, amp, f, seed, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) {
      const wx = x + off;
      const y = base - amp * (0.55 + 0.3 * Math.sin(wx * f + seed) + 0.15 * Math.sin(wx * f * 2.7 + seed * 2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  function drawDeco(type, x, gy, s, k, col) {
    const v = hash(k);
    ctx.save(); ctx.translate(x, gy); ctx.scale(s * (0.8 + v * 0.5), s * (0.8 + v * 0.5));
    switch (type) {
      case 'tree':
        ctx.fillStyle = '#5a3a20'; rr(-5, -50, 10, 50, 3); ctx.fill();
        ctx.fillStyle = col; circ(0, -62, 26); ctx.fill(); circ(-18, -50, 18); ctx.fill(); circ(18, -52, 18); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.08)'; circ(-6, -70, 12); ctx.fill(); break;
      case 'pine':
        ctx.fillStyle = '#4a3020'; ctx.fillRect(-4, -18, 8, 18);
        ctx.fillStyle = col;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-28 + i * 6, -14 - i * 22); ctx.lineTo(28 - i * 6, -14 - i * 22); ctx.lineTo(0, -50 - i * 24); ctx.fill(); }
        if (THEMES[S.zone].amb === 'snow') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-8, -88); ctx.lineTo(8, -88); ctx.lineTo(0, -98); ctx.fill(); }
        break;
      case 'dead':
        ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2, -60); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1, -35); ctx.lineTo(-20, -55); ctx.moveTo(2, -48); ctx.lineTo(22, -70); ctx.moveTo(-12, -46); ctx.lineTo(-18, -66); ctx.stroke(); break;
      case 'crystal':
        ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = col; ctx.globalAlpha = 0.75;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 12 - 7, 0); ctx.lineTo(i * 12, -30 - (i === 0 ? 20 : 0) - v * 10); ctx.lineTo(i * 12 + 7, 0); ctx.fill(); }
        break;
      case 'cactus':
        ctx.fillStyle = col; rr(-7, -60, 14, 60, 7); ctx.fill(); rr(-24, -42, 10, 22, 5); ctx.fill(); rr(14, -50, 10, 24, 5); ctx.fill();
        ctx.fillRect(-18, -26, 12, 7); ctx.fillRect(6, -32, 12, 7); break;
      case 'tomb':
        ctx.fillStyle = col; rr(-14, -36, 28, 36, [14, 14, 2, 2]); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-2, -28, 4, 16); ctx.fillRect(-7, -23, 14, 4); break;
      case 'spike':
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-6, -70 - v * 30); ctx.lineTo(4, 0); ctx.moveTo(0, 0); ctx.lineTo(14, -40); ctx.lineTo(24, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,90,20,.5)'; ctx.fillRect(-8, -6, 18, 6); break;
      case 'rock':
        ctx.fillStyle = col; ell(0, -14, 30, 18); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.1)'; ell(-8, -20, 12, 6); ctx.fill(); break;
    }
    ctx.restore();
  }

  function drawBackground(t) {
    const th = THEMES[S.zone] || THEMES.z1;
    const gy = H * 0.84;
    const sky = ctx.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (th.amb === 'star') for (let i = 0; i < 50; i++) {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i));
      ctx.fillStyle = '#fff'; ctx.fillRect((hash(i) * W * 1.3 - scroll * 0.05) % W, hash(i + 99) * gy * 0.8, 2, 2);
    }
    ctx.globalAlpha = 1;
    if (!th.cave && th.amb !== 'star') { // sol/lua
      ctx.fillStyle = th.amb === 'ember' ? 'rgba(255,120,40,.6)' : 'rgba(255,255,230,.55)';
      circ(W * 0.82, H * 0.18, 26); ctx.fill();
    }
    ridge(scroll * 0.15, gy - 40, gy * 0.5, 0.006, 1, th.far);
    ridge(scroll * 0.35, gy - 10, gy * 0.32, 0.011, 4, th.mid);
    if (th.cave) {
      ctx.fillStyle = '#15121a';
      for (let i = -1; i < W / 60 + 2; i++) {
        const k = Math.floor((scroll * 0.6) / 60) + i, x = k * 60 - scroll * 0.6;
        ctx.beginPath(); ctx.moveTo(x - 18, 0); ctx.lineTo(x, 30 + hash(k) * 60); ctx.lineTo(x + 18, 0); ctx.fill();
      }
    }
    // decoração (meio)
    const sp = 170, s = clamp(H / 320, 0.6, 1.3), off = scroll * 0.7;
    for (let i = -1; i < W / sp + 2; i++) {
      const k = Math.floor(off / sp) + i;
      if (hash(k * 3.1) < 0.35) continue;
      drawDeco(th.deco, k * sp - off + hash(k) * 60, gy + 2, s * 0.9, k, th.dc);
    }
    // chão
    const g = ctx.createLinearGradient(0, gy, 0, H);
    g.addColorStop(0, th.g[0]); g.addColorStop(1, th.g[1]);
    ctx.fillStyle = g; ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let i = -1; i < W / 40 + 2; i++) {
      const k = Math.floor(scroll / 40) + i;
      ell(k * 40 - scroll + hash(k) * 20, gy + 8 + hash(k + 5) * (H - gy - 12), 6 + hash(k + 2) * 10, 2); ctx.fill();
    }
  }

  function ambient(dt, t) {
    const th = THEMES[S.zone] || THEMES.z1;
    if (st.amb.length < 40 && Math.random() < dt * 20) {
      const a = th.amb;
      const p = { x: Math.random() * W, y: Math.random() * H * 0.85, vx: 0, vy: 0, life: 4 + Math.random() * 3, t: 0, a };
      if (a === 'snow') { p.y = -5; p.vy = 25 + Math.random() * 25; p.vx = -10; }
      if (a === 'ember') { p.y = H; p.vy = -30 - Math.random() * 30; }
      if (a === 'leaf') { p.y = -5; p.vy = 20; p.vx = -15; }
      if (a === 'bubble') { p.y = H * 0.86; p.vy = -12; }
      if (a === 'sand') { p.vx = -60; p.x = W + 5; }
      st.amb.push(p);
    }
    for (const p of st.amb) {
      p.t += dt; p.x += (p.vx - (st.hero.state === 'run' ? 60 : 0) * 0.3) * dt + Math.sin(t * 2 + p.life) * 0.3; p.y += p.vy * dt;
      const al = Math.min(1, p.t, p.life - p.t);
      ctx.globalAlpha = clamp(al, 0, 1) * 0.8;
      switch (p.a) {
        case 'snow': ctx.fillStyle = '#fff'; circ(p.x, p.y, 2); ctx.fill(); break;
        case 'ember': ctx.fillStyle = '#ff8030'; ctx.fillRect(p.x, p.y, 2, 3); break;
        case 'firefly': case 'wisp': ctx.fillStyle = p.a === 'wisp' ? '#a0c0ff' : '#e0ff80'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8; circ(p.x, p.y, 2); ctx.fill(); ctx.shadowBlur = 0; break;
        case 'leaf': ctx.fillStyle = '#7aa040'; ell(p.x, p.y, 4, 2); ctx.fill(); break;
        case 'bubble': ctx.strokeStyle = '#a8c8a0'; ctx.lineWidth = 1; circ(p.x, p.y, 3); ctx.stroke(); break;
        case 'sand': ctx.fillStyle = '#f0d8a0'; ctx.fillRect(p.x, p.y, 3, 1); break;
        default: ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(p.x, p.y, 1.5, 1.5);
      }
    }
    ctx.globalAlpha = 1;
    st.amb = st.amb.filter((p) => p.t < p.life && p.y < H + 10 && p.y > -10 && p.x > -10);
  }

  // ---------- herói ----------
  function heroBaseX() { return W * (RANGED[CLASSES[S.cls].weapon] ? 0.27 : 0.36); }
  function monBaseX(boss) { return W * (boss ? 0.72 : 0.68); }

  function headGear(L) {
    ctx.fillStyle = L.hair;
    switch (L.head) {
      case 'mohawk': for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-8 + i * 4, -80); ctx.lineTo(-6 + i * 4, -92 + i); ctx.lineTo(-2 + i * 4, -80); ctx.fill(); } break;
      case 'goggles':
        ctx.fillStyle = L.hair; ell(0, -78, 12, 6); ctx.fill();
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(-12, -76, 24, 4); ctx.fillStyle = '#80e0ff'; circ(6, -74, 3.5); ctx.fill(); break;
      case 'ponytail':
        ell(0, -77, 13, 7); ctx.fill(); ell(-13, -68, 5, 11); ctx.fill(); break;
      case 'plume':
        ctx.fillStyle = '#9aa4b4'; ctx.beginPath(); ctx.arc(0, -71, 13, Math.PI, 0); ctx.fill();
        ctx.fillStyle = L.hair; ell(-3, -88, 4, 9); ctx.fill(); break;
      case 'helm':
        ctx.fillStyle = '#c8ccd8'; ctx.beginPath(); ctx.arc(0, -71, 13.5, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
        ctx.fillStyle = '#e0b040'; ctx.fillRect(-1.5, -85, 3, 12); break;
      case 'winged':
        ctx.fillStyle = '#c8d0e0'; ctx.beginPath(); ctx.arc(0, -71, 13, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-10, -76); ctx.lineTo(-22, -88); ctx.lineTo(-14, -74); ctx.fill();
        ctx.fillStyle = L.hair; ell(-8, -62, 5, 9); ctx.fill(); break;
      case 'wizard':
        ctx.fillStyle = L.body; ctx.beginPath(); ctx.moveTo(-17, -76); ctx.lineTo(17, -76); ctx.lineTo(-6, -106); ctx.fill();
        ctx.fillStyle = L.trim; ctx.fillRect(-16, -78, 32, 4);
        ctx.fillStyle = L.hair; ctx.beginPath(); ctx.moveTo(-2, -64); ctx.lineTo(8, -64); ctx.lineTo(3, -52); ctx.fill(); break;
      case 'hood':
        ctx.fillStyle = L.body; ctx.beginPath(); ctx.arc(0, -70, 15, Math.PI * 0.75, Math.PI * 2.25); ctx.fill();
        ctx.strokeStyle = 'rgba(255,220,100,.8)'; ctx.lineWidth = 2; ell(0, -92, 10, 3); ctx.stroke(); break;
    }
  }

  function drawWeapon(type, L, t, glow) {
    // mão na origem, arma aponta para +y
    switch (type) {
      case 'machado':
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-2, -6, 4, 40);
        ctx.fillStyle = '#c8ccd4'; ctx.beginPath(); ctx.moveTo(2, 22); ctx.quadraticCurveTo(20, 28, 16, 42); ctx.lineTo(2, 34); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-2, 24); ctx.quadraticCurveTo(-12, 30, -10, 38); ctx.lineTo(-2, 32); ctx.fill(); break;
      case 'martelo':
        ctx.fillStyle = '#5a4a3a'; ctx.fillRect(-2, -6, 4, 36);
        ctx.fillStyle = '#8a929e'; rr(-11, 26, 22, 14, 3); ctx.fill();
        ctx.fillStyle = glow ? '#80e0ff' : '#c09a40'; ctx.fillRect(-11, 31, 22, 4); break;
      case 'espada':
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-2, -4, 4, 9);
        ctx.fillStyle = '#e0b040'; ctx.fillRect(-8, 5, 16, 3);
        ctx.fillStyle = glow ? '#fff8d0' : '#dfe4ee'; ctx.beginPath(); ctx.moveTo(-3, 8); ctx.lineTo(3, 8); ctx.lineTo(2.5, 42); ctx.lineTo(0, 47); ctx.lineTo(-2.5, 42); ctx.fill(); break;
      case 'lanca':
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-1.8, -18, 3.6, 66);
        ctx.fillStyle = '#dfe4ee'; ctx.beginPath(); ctx.moveTo(-5, 46); ctx.lineTo(5, 46); ctx.lineTo(0, 62); ctx.fill();
        ctx.fillStyle = L.hair; ctx.fillRect(-4, 42, 8, 3); break;
      case 'dardo':
        ctx.fillStyle = '#8a6a40'; ctx.fillRect(-1.5, -10, 3, 42);
        ctx.fillStyle = '#dfe4ee'; ctx.beginPath(); ctx.moveTo(-4, 30); ctx.lineTo(4, 30); ctx.lineTo(0, 42); ctx.fill(); break;
      case 'cajado':
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(-2, -14, 4, 54);
        ctx.fillStyle = glow ? '#ffb0ff' : '#b070ff'; ctx.shadowColor = '#c080ff'; ctx.shadowBlur = glow ? 20 : 8;
        circ(0, 44, 6 + (glow ? Math.sin(t * 20) * 1.5 : 0)); ctx.fill(); ctx.shadowBlur = 0; break;
      case 'cetro':
        ctx.fillStyle = '#e0b040'; ctx.fillRect(-1.8, -4, 3.6, 30);
        ctx.beginPath(); ctx.arc(0, 30, 7, 0, Math.PI * 2); ctx.strokeStyle = '#e0b040'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = glow ? '#fffbe0' : '#ffe680'; ctx.shadowColor = '#fff0a0'; ctx.shadowBlur = glow ? 22 : 8; circ(0, 30, 4); ctx.fill(); ctx.shadowBlur = 0; break;
      case 'arco':
        ctx.strokeStyle = '#7a5030'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(-6, 0, 22, -1.2, 1.2); ctx.stroke(); break;
    }
  }

  function drawHero(t) {
    const h = st.hero, cls = CLASSES[S.cls], L = LOOK[S.cls], wt = cls.weapon;
    const s = clamp(Math.min(W / 520, H / 290), 0.62, 1.35);
    const gy = H * 0.84;
    let x = heroBaseX();
    const a = h.atk ? clamp((t - h.atk.start) / h.atk.dur, 0, 1) : 1;
    if (h.atk && a >= 1) h.atk = null;
    const melee = !RANGED[wt];
    if (h.atk && melee) {
      const lunge = Math.max(0, monBaseX(st.mon && st.mon.boss) - x - (wt === 'lanca' ? 95 : 70) * s);
      x += Math.sin(clamp((a - 0.15) / 0.65, 0, 1) * Math.PI) * lunge;
    }
    const hurt = t - h.hurt < 0.18;
    if (hurt) x -= 5;
    ctx.save(); ctx.translate(x, gy); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ell(0, 0, 22, 5); ctx.fill();
    // aura de buffs
    if (R.buffs && R.buffs.length) {
      const gr = ctx.createRadialGradient(0, -40, 5, 0, -40, 55);
      gr.addColorStop(0, 'rgba(255,220,120,.25)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = gr; circ(0, -40, 55 + Math.sin(t * 4) * 3); ctx.fill();
      ctx.strokeStyle = `rgba(255,220,120,${0.35 + Math.sin(t * 4) * 0.15})`; ctx.lineWidth = 2; ell(0, 0, 30, 8); ctx.stroke();
    }
    if (R.dead > 0) { ctx.globalAlpha = 0.75; ctx.translate(-30, -4); ctx.rotate(-Math.PI / 2); ctx.translate(0, 30); }
    if (hurt) ctx.filter = 'brightness(2.2) saturate(0.4)';
    const run = h.state === 'run' && !(R.dead > 0);
    const ph = t * 13;
    const bob = run ? Math.abs(Math.sin(ph)) * 3 : Math.sin(t * 2.6) * 1.2;
    ctx.translate(0, -bob);
    const legA = run ? Math.sin(ph) * 0.7 : (h.atk && melee ? Math.sin(a * Math.PI) * 0.4 : 0);
    const boots = shade(L.pants, -0.4);
    // perna de trás
    limb(-3, -30, -legA, 28, 8, shade(L.pants, -0.2), boots);
    // braço de trás
    let backA = run ? -Math.sin(ph) * 0.6 : 0.15 + Math.sin(t * 2.6) * 0.05;
    if (wt === 'arco') backA = -1.45 + (h.atk && a < 0.45 ? 0.2 : 0);
    if (wt === 'espada') backA = -0.7;
    limb(-6, -55, backA, 22, 7, L.bare ? shade(L.skin, -0.12) : shade(L.body, -0.25));
    // perna da frente
    limb(3, -30, legA, 28, 8, L.pants, boots);
    // corpo
    if (L.robe) {
      ctx.fillStyle = L.body; ctx.beginPath(); ctx.moveTo(-11, -60); ctx.lineTo(11, -60); ctx.lineTo(16, -6); ctx.lineTo(-16, -6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = L.trim; ctx.fillRect(-15.5, -10, 31, 4); ctx.fillRect(-2, -58, 4, 50);
    } else {
      ctx.fillStyle = L.body; rr(-11, -61, 22, 33, 6); ctx.fill();
      ctx.fillStyle = L.trim; ctx.fillRect(-11, -34, 22, 4);
      if (L.bare) { ctx.fillStyle = L.skin; ctx.beginPath(); ctx.moveTo(-6, -61); ctx.lineTo(6, -61); ctx.lineTo(0, -50); ctx.fill(); }
    }
    ctx.fillStyle = L.trim; circ(-7, -56, 6); ctx.fill();
    // escudo do paladino
    if (wt === 'espada') {
      ctx.save(); ctx.translate(10, -40);
      ctx.fillStyle = '#c8ccd8'; ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(9, -14); ctx.lineTo(9, 2); ctx.lineTo(0, 14); ctx.lineTo(-9, 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e0b040'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#e0b040'; ctx.fillRect(-1.5, -10, 3, 16); ctx.fillRect(-6, -5, 12, 3); ctx.restore();
    }
    // cabeça
    ctx.fillStyle = L.skin; circ(1, -71, 12); ctx.fill();
    ctx.fillStyle = '#2a1a10'; circ(7, -72, 1.8); ctx.fill();
    headGear(L);
    // braço da frente + arma
    const rest = run ? -0.25 + Math.sin(ph) * 0.5 : -0.45 + Math.sin(t * 2.6) * 0.05;
    let fa = rest, glow = false, showW = true;
    if (wt === 'arco') fa = -1.57;
    else if (wt === 'lanca') {
      fa = run ? -1.2 : -1.35;
      if (h.atk) fa = -1.57;
    } else if (h.atk) {
      if (melee) {
        fa = a < 0.4 ? lerp(rest, -3.0, ease(a / 0.4)) : a < 0.6 ? lerp(-3.0, -0.5, (a - 0.4) / 0.2) : lerp(-0.5, rest, (a - 0.6) / 0.4);
        glow = h.atk.skill;
      } else if (wt === 'dardo') {
        fa = a < 0.35 ? lerp(rest, -3.4, ease(a / 0.35)) : a < 0.5 ? lerp(-3.4, -1.2, (a - 0.35) / 0.15) : lerp(-1.2, rest, (a - 0.5) / 0.5);
        showW = !(a > 0.45 && a < 0.9);
      } else {
        fa = a < 0.35 ? lerp(rest, -2.5, ease(a / 0.35)) : a < 0.7 ? -2.5 : lerp(-2.5, rest, (a - 0.7) / 0.3);
        glow = true;
      }
    }
    ctx.save(); ctx.translate(6, -55); ctx.rotate(fa);
    ctx.fillStyle = L.bare ? L.skin : shade(L.body, -0.1); rr(-3.5, 0, 7, 22, 3.5); ctx.fill();
    ctx.fillStyle = L.skin; circ(0, 22, 3.6); ctx.fill();
    ctx.translate(0, 22);
    if (wt === 'arco') {
      ctx.rotate(-Math.PI / 2);
      drawWeapon('arco', L, t, glow);
      // corda
      const pull = h.atk && a < 0.45 ? ease(a / 0.45) * 14 : 0;
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
      const ex = -6 + 22 * Math.cos(1.2), ey = 22 * Math.sin(1.2);
      ctx.beginPath(); ctx.moveTo(ex, -ey); ctx.lineTo(-pull + ex - 8, 0); ctx.lineTo(ex, ey); ctx.stroke();
      if (pull > 0) { ctx.fillStyle = '#8a6a40'; ctx.fillRect(ex - 8 - pull, -1, 34, 2); }
    } else if (showW) drawWeapon(wt, L, t, glow);
    ctx.restore();
    ctx.filter = 'none';
    ctx.restore();
    h.x = x; h.s = s;
  }

  // ---------- monstros ----------
  function drawMonsterBody(m, t) {
    const c = m.color, dk = shade(c, -0.35), lt = shade(c, 0.25);
    const eye = (x, y, r = 3) => { ctx.fillStyle = '#fff'; circ(x, y, r); ctx.fill(); ctx.fillStyle = m.boss ? '#d02020' : '#111'; circ(x - r * 0.3, y, r * 0.55); ctx.fill(); };
    const red = (x, y, r = 3) => { ctx.fillStyle = '#ff3030'; ctx.shadowColor = '#ff3030'; ctx.shadowBlur = 8; circ(x, y, r); ctx.fill(); ctx.shadowBlur = 0; };
    const walk = Math.sin(t * 6 + m.seed);
    switch (m.kind) {
      case 'slime': {
        const sq = 1 + Math.sin(t * 4 + m.seed) * 0.08;
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, -20 * sq, 28 / sq, 20 * sq, 0, Math.PI, 0); ctx.lineTo(28 / sq, 0); ctx.lineTo(-28 / sq, 0); ctx.fill();
        ctx.fillStyle = lt; ell(-8, -30 * sq, 7, 4); ctx.fill();
        if (m.extra === 'frog') { ctx.fillStyle = c; circ(-12, -38 * sq, 7); ctx.fill(); circ(6, -38 * sq, 7); ctx.fill(); eye(-12, -39 * sq, 4); eye(6, -39 * sq, 4); }
        else { eye(-12, -22 * sq); eye(0, -23 * sq); }
        if (m.extra === 'teeth') { ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-20 + i * 6, -10); ctx.lineTo(-17 + i * 6, -4); ctx.lineTo(-14 + i * 6, -10); ctx.fill(); } }
        break;
      }
      case 'beast': {
        const small = m.extra === 'ears';
        ctx.save(); if (small) ctx.scale(0.75, 0.75);
        ctx.strokeStyle = dk; ctx.lineWidth = 6; ctx.lineCap = 'round';
        for (const [lx, ph] of [[-18, 0], [-10, Math.PI], [12, Math.PI], [20, 0]]) { ctx.beginPath(); ctx.moveTo(lx, -18); ctx.lineTo(lx + Math.sin(t * 8 + ph) * 3, -2); ctx.stroke(); }
        ctx.fillStyle = c; ell(0, -26, 28, 14); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(25, -28); ctx.quadraticCurveTo(38, -34 + walk * 3, 40, -44); ctx.stroke();
        ctx.fillStyle = c; circ(-28, -34, 13); ctx.fill(); ell(-38, -30, 9, 6); ctx.fill();
        if (small) { ell(-26, -54, 4, 12); ctx.fill(); ell(-20, -52, 4, 11); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(-32, -44); ctx.lineTo(-30, -56); ctx.lineTo(-24, -44); ctx.fill(); ctx.beginPath(); ctx.moveTo(-24, -44); ctx.lineTo(-20, -55); ctx.lineTo(-17, -42); ctx.fill(); }
        ctx.fillStyle = '#111'; circ(-46, -31, 2.5); ctx.fill();
        eye(-31, -38, 3);
        if (m.extra === 'tusks') { ctx.fillStyle = '#f8f0d8'; ctx.beginPath(); ctx.moveTo(-40, -26); ctx.quadraticCurveTo(-50, -30, -48, -40); ctx.lineTo(-44, -28); ctx.fill(); }
        if (m.extra === 'flame') { ctx.fillStyle = 'rgba(255,120,30,.8)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-10 + i * 8, -38); ctx.lineTo(-6 + i * 8, -50 - Math.abs(Math.sin(t * 10 + i)) * 8); ctx.lineTo(-2 + i * 8, -38); ctx.fill(); } }
        ctx.restore(); break;
      }
      case 'humanoid': case 'skeleton': {
        const bone = m.kind === 'skeleton';
        const ws = m.extra === 'cyclops' ? 1.3 : 1;
        ctx.save(); ctx.scale(ws, ws);
        if (m.extra === 'wings') {
          ctx.fillStyle = '#20202a'; for (const sgn of [1]) { ctx.beginPath(); ctx.moveTo(4, -50); ctx.quadraticCurveTo(40, -90 + walk * 6, 46, -40); ctx.quadraticCurveTo(30, -50, 4, -36); ctx.fill(); }
        }
        const lc = bone ? c : dk;
        ctx.strokeStyle = lc; ctx.lineCap = 'round'; ctx.lineWidth = bone ? 4 : 8;
        ctx.beginPath(); ctx.moveTo(-4, -30); ctx.lineTo(-6 + walk * 4, 0); ctx.moveTo(4, -30); ctx.lineTo(6 - walk * 4, 0); ctx.stroke();
        if (bone) {
          ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -60); ctx.stroke();
          ctx.lineWidth = 2.5; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-9, -38 - i * 5); ctx.lineTo(9, -38 - i * 5); ctx.stroke(); }
          if (m.extra === 'crown') { ctx.fillStyle = '#2a1a40'; ctx.beginPath(); ctx.moveTo(-12, -60); ctx.lineTo(12, -60); ctx.lineTo(16, 0); ctx.lineTo(-16, 0); ctx.fill(); }
        } else {
          ctx.fillStyle = c; rr(-11, -62, 22, 34, 6); ctx.fill();
          if (m.extra === 'wrap') { ctx.strokeStyle = shade(c, -0.2); ctx.lineWidth = 1.5; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-11, -58 + i * 5); ctx.lineTo(11, -55 + i * 5); ctx.stroke(); } }
        }
        // braço (garras para a esquerda)
        const arm = m.atk ? -1.4 : -0.5 + walk * 0.1;
        ctx.save(); ctx.translate(-6, -56); ctx.rotate(-arm); ctx.strokeStyle = bone ? c : (m.extra === 'wrap' ? c : shade(c, -0.15)); ctx.lineWidth = bone ? 4 : 7;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 24); ctx.stroke();
        if (m.extra === 'horns' || m.boss) { ctx.fillStyle = '#c8ccd4'; ctx.fillRect(-2, 18, 4, 30); }
        ctx.restore();
        // cabeça
        ctx.fillStyle = c; circ(-2, -72, 12); ctx.fill();
        if (bone) { ctx.fillStyle = '#111'; circ(-7, -73, 3); ctx.fill(); circ(1, -73, 3); ctx.fill(); if (m.extra === 'crown' || m.boss) { red(-7, -73, 2); red(1, -73, 2); } }
        else if (m.extra === 'cyclops') eye(-5, -73, 6);
        else if (m.extra === 'horns') { red(-8, -73, 2.5); red(0, -73, 2.5); }
        else { eye(-8, -73, 2.8); eye(0, -73, 2.8); }
        if (m.extra === 'ears') { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(6, -76); ctx.lineTo(20, -84); ctx.lineTo(8, -68); ctx.fill(); }
        if (m.extra === 'hat') { ctx.fillStyle = '#201828'; ell(-2, -82, 20, 4); ctx.fill(); ctx.beginPath(); ctx.moveTo(-12, -82); ctx.lineTo(8, -82); ctx.lineTo(10, -110); ctx.fill(); }
        if (m.extra === 'horns') { ctx.fillStyle = '#e0d8c0'; ctx.beginPath(); ctx.moveTo(-10, -80); ctx.lineTo(-16, -96); ctx.lineTo(-4, -82); ctx.fill(); ctx.beginPath(); ctx.moveTo(4, -82); ctx.lineTo(10, -96); ctx.lineTo(8, -78); ctx.fill(); }
        if (m.extra === 'helmet') { ctx.fillStyle = '#c0a020'; ctx.beginPath(); ctx.arc(-2, -74, 13, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#fff8a0'; circ(-8, -82, 3); ctx.fill(); }
        if (m.extra === 'crown') { ctx.fillStyle = '#f0c030'; ctx.beginPath(); ctx.moveTo(-13, -80); ctx.lineTo(-13, -92); ctx.lineTo(-7, -86); ctx.lineTo(-2, -96); ctx.lineTo(3, -86); ctx.lineTo(9, -92); ctx.lineTo(9, -80); ctx.fill(); }
        ctx.restore(); break;
      }
      case 'flyer': {
        const fy = -60 + Math.sin(t * 3 + m.seed) * 8, flap = Math.sin(t * 16) * 0.8;
        ctx.save(); ctx.translate(0, fy);
        ctx.fillStyle = dk;
        for (const sg of [-1, 1]) { ctx.save(); ctx.scale(1, 1); ctx.rotate(sg * 0.2); ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(sg * 30, -30 * flap - 10, sg * 42, 4 * flap); ctx.quadraticCurveTo(sg * 20, 0, 0, 6); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = c; ell(0, 0, 14, 12); ctx.fill();
        if (m.extra === 'beak') { ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-24, 2); ctx.lineTo(-12, 5); ctx.fill(); ctx.fillStyle = '#f0e8d8'; circ(-8, -4, 8); ctx.fill(); }
        if (m.extra === 'horns') { ctx.fillStyle = '#300'; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(-12, -20); ctx.lineTo(-3, -10); ctx.fill(); ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(6, -22); ctx.lineTo(9, -8); ctx.fill(); }
        if (m.extra === 'horns' || !m.extra) { red(-6, -2, 2.5); red(2, -2, 2.5); } else eye(-8, -5, 2.5);
        ctx.restore(); break;
      }
      case 'golem': {
        ctx.save(); ctx.scale(1.25, 1.25);
        ctx.fillStyle = dk; rr(-16, -26, 12, 26, 3); ctx.fill(); rr(4, -26, 12, 26, 3); ctx.fill();
        ctx.fillStyle = c; rr(-22, -68, 44, 44, 8); ctx.fill();
        ctx.fillStyle = lt; rr(-18, -64, 14, 10, 3); ctx.fill();
        const arm = m.atk ? -1.5 : -0.2;
        ctx.save(); ctx.translate(-20, -60); ctx.rotate(-arm); ctx.fillStyle = shade(c, -0.15); rr(-7, 0, 14, 34, 6); ctx.fill(); ctx.restore();
        ctx.fillStyle = c; rr(-14, -88, 26, 22, 6); ctx.fill();
        if (m.extra === 'fur') { eye(-8, -78, 3); eye(2, -78, 3); } else { red(-8, -78, 3); red(2, -78, 3); }
        if (m.extra === 'flame') { ctx.fillStyle = 'rgba(255,170,40,.85)'; ctx.shadowColor = '#ff8020'; ctx.shadowBlur = 12; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-12 + i * 5.5, -88); ctx.lineTo(-10 + i * 5.5, -100 - Math.abs(Math.sin(t * 9 + i)) * 12); ctx.lineTo(-6 + i * 5.5, -88); ctx.fill(); } ctx.shadowBlur = 0; }
        ctx.restore(); break;
      }
      case 'bug': {
        ctx.strokeStyle = dk; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-6 + i * 6, -14); ctx.lineTo(-10 + i * 8 + sg * 6, -24 + Math.sin(t * 10 + i) * 2); ctx.lineTo(-14 + i * 10 + sg * 10, 0); ctx.stroke(); }
        ctx.fillStyle = c; ell(6, -18, 18, 12); ctx.fill(); ctx.fillStyle = dk; circ(-16, -16, 10); ctx.fill();
        red(-21, -19, 2); red(-16, -21, 2); red(-12, -19, 2);
        if (m.extra === 'tail') { ctx.strokeStyle = c; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(22, -20); ctx.quadraticCurveTo(44, -40, 30, -62 + walk * 3); ctx.stroke(); ctx.fillStyle = '#300'; ctx.beginPath(); ctx.moveTo(30, -62); ctx.lineTo(20, -60); ctx.lineTo(28, -72); ctx.fill(); }
        break;
      }
      case 'serpent': {
        for (let i = 8; i >= 0; i--) { const sx = i * 7, sy = -10 - Math.sin(t * 5 + i * 0.7) * 6 - (i < 3 ? (3 - i) * 10 : 0); ctx.fillStyle = i % 2 ? c : shade(c, -0.1); circ(sx - 10, sy, 11 - i * 0.6); ctx.fill(); }
        eye(-16, -44, 3); ctx.strokeStyle = '#d02020'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-20, -38); ctx.lineTo(-28, -36 + Math.sin(t * 20) * 2); ctx.stroke();
        break;
      }
      case 'ghost': {
        const fy = -20 + Math.sin(t * 2.5 + m.seed) * 6;
        ctx.save(); ctx.translate(0, fy); ctx.globalAlpha *= 0.8; ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(0, -40, 20, Math.PI, 0); ctx.lineTo(20, 0);
        for (let i = 0; i < 5; i++) ctx.quadraticCurveTo(16 - i * 8, 8 + Math.sin(t * 6 + i) * 4, 12 - i * 8, 0);
        ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#102030'; ell(-9, -42, 3.5, 5); ctx.fill(); ell(1, -42, 3.5, 5); ctx.fill(); ell(-4, -28, 4, 5); ctx.fill();
        ctx.restore(); break;
      }
      case 'plant': {
        ctx.fillStyle = c; rr(-12, -60, 24, 60, 6); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-8, -40); ctx.lineTo(-30, -50 + (m.atk ? 20 : walk * 4)); ctx.moveTo(8, -44); ctx.lineTo(26, -58); ctx.stroke();
        ctx.fillStyle = '#4a8a30'; circ(0, -70, 22); ctx.fill(); circ(-16, -62, 12); ctx.fill(); circ(16, -64, 12); ctx.fill();
        ctx.fillStyle = '#2a1a0a'; ell(-6, -42, 3, 4); ctx.fill(); ell(4, -42, 3, 4); ctx.fill(); ell(-1, -30, 5, 3); ctx.fill();
        break;
      }
      case 'eye': {
        const fy = -60 + Math.sin(t * 2 + m.seed) * 8;
        ctx.save(); ctx.translate(0, fy);
        ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-12 + i * 5, 14); ctx.quadraticCurveTo(-16 + i * 6 + Math.sin(t * 4 + i) * 8, 34, -10 + i * 5 + Math.sin(t * 3 + i) * 10, 50); ctx.stroke(); }
        ctx.fillStyle = c; ctx.shadowColor = '#a040ff'; ctx.shadowBlur = 20; circ(0, 0, 24); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#f0e8d8'; circ(-4, 0, 14); ctx.fill(); ctx.fillStyle = '#c02040'; circ(-8, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ell(-9, 0, 2, 6); ctx.fill();
        if (m.extra === 'crown') { ctx.fillStyle = '#c090ff'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-18 + i * 9, -18); ctx.lineTo(-14 + i * 9, -36 - (i === 2 ? 8 : 0)); ctx.lineTo(-10 + i * 9, -18); ctx.fill(); } }
        ctx.restore(); break;
      }
      case 'dragon': {
        const flap = Math.sin(t * 5) * 0.5;
        ctx.save(); ctx.scale(1.1, 1.1);
        ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(0, -50); ctx.quadraticCurveTo(30, -110 - flap * 30, 60, -100 - flap * 20); ctx.quadraticCurveTo(40, -70, 20, -40); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(26, -24); ctx.quadraticCurveTo(60, -10, 70, -30 + walk * 4); ctx.stroke();
        ctx.fillStyle = dk; rr(-14, -22, 10, 22, 4); ctx.fill(); rr(10, -22, 10, 22, 4); ctx.fill();
        ctx.fillStyle = c; ell(4, -32, 30, 18); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-14, -40); ctx.quadraticCurveTo(-26, -60, -30, -72); ctx.stroke();
        ctx.fillStyle = c; ell(-38, -76, 16, 10); ctx.fill();
        ctx.fillStyle = lt; ctx.beginPath(); ctx.moveTo(-30, -84); ctx.lineTo(-22, -100); ctx.lineTo(-26, -82); ctx.fill();
        red(-42, -79, 2.5);
        ctx.restore(); break;
      }
    }
  }

  function drawMonster(m, t) {
    const gy = H * 0.84, s = clamp(Math.min(W / 520, H / 290), 0.62, 1.35) * (m.boss ? 1.55 : 1);
    let x = m.x;
    let alpha = 1, rot = 0, sink = 0;
    if (m.atk) {
      const a = clamp((t - m.atk) / 0.35, 0, 1);
      x -= Math.sin(a * Math.PI) * 38 * s;
      if (a >= 1) m.atk = 0;
    }
    const hurt = t - m.hurt < 0.15;
    if (hurt) x += 6;
    if (m.dieAt && t > m.dieAt) {
      const d = clamp((t - m.dieAt) / 0.7, 0, 1);
      alpha = 1 - d; rot = d * 0.9; sink = d * 10;
    }
    ctx.save(); ctx.translate(x, gy); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ell(0, 0, 26 * s, 6 * s); ctx.fill();
    ctx.translate(0, sink); ctx.rotate(rot); ctx.scale(s, s);
    if (m.boss) { ctx.shadowColor = '#b060ff'; }
    if (hurt || (m.dieAt && t > m.dieAt && t - m.dieAt < 0.12)) ctx.filter = 'brightness(3) saturate(0)';
    drawMonsterBody(m, t);
    ctx.filter = 'none';
    ctx.restore();
    m.top = gy - 110 * s;
  }

  // ---------- efeitos ----------
  function burst(x, y, col, n = 12, spd = 140, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random());
      st.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.4 + Math.random() * 0.4, t: 0, col, size: size * (0.5 + Math.random()), g: 260 });
    }
  }
  function addFloat(x, y, text, cls) {
    st.floats.push({ x: x + (Math.random() - 0.5) * 30, y, text, cls, t: 0 });
  }
  function later(delay, fn) { st.timers.push({ at: now() + delay, fn }); }

  function skillColor(name, wt) {
    if (/Gelo|Glacial/i.test(name)) return '#80d8ff';
    if (/Fogo|Meteoro|Fênix|Chamas/i.test(name)) return '#ff7a20';
    if (/Sagrad|Luz|Raio|Celest|Ira|Cruz|Julgamento|Esfera/i.test(name)) return '#ffe680';
    if (/Nova|Arcano|Elemental/i.test(name)) return '#c070ff';
    if (/Trovão|Choque|Sísmico/i.test(name)) return '#80e0ff';
    return { cajado: '#ff8a30', cetro: '#ffe680', arco: '#f0e0b0', dardo: '#e0e8f0' }[wt] || '#ffffff';
  }

  function monCenter() {
    const m = st.mon; if (!m) return null;
    const s = (m.boss ? 1.55 : 1) * clamp(Math.min(W / 520, H / 290), 0.62, 1.35);
    const fly = m.kind === 'flyer' || m.kind === 'eye';
    return { x: m.x, y: H * 0.84 - (fly ? 60 : 38) * s };
  }

  // ---------- eventos do jogo ----------
  function playerAttack(o) {
    if (!running || document.hidden) return;
    const t = now(), wt = CLASSES[S.cls].weapon, melee = !RANGED[wt];
    const dur = melee ? 0.42 : 0.5;
    st.hero.atk = { start: t, dur, skill: !!o.skill };
    const mc = monCenter(); if (!mc) return;
    const col = o.skill ? skillColor(o.skillName || '', wt) : skillColor('', wt);
    const impact = (dx = 0) => {
      const m = st.mon; if (m) m.hurt = now();
      const c = monCenter() || mc;
      if (!o.miss) {
        burst(c.x + dx, c.y, o.crit ? '#ffb040' : col, o.skill ? 22 : 10, o.skill ? 220 : 140);
        if (o.crit || o.skill) shake = Math.max(shake, o.skill ? 8 : 5);
      }
      addFloat(c.x, (st.mon ? st.mon.top : c.y - 60), o.text, o.cls);
    };
    if (melee) {
      later(dur * 0.48, () => {
        const c = monCenter() || mc;
        st.fx.push({ type: 'slash', x: c.x - 10, y: c.y, t: 0, life: 0.22, col: o.skill ? col : '#ffffff', big: o.skill });
        if (o.skill) st.fx.push({ type: 'ring', x: c.x, y: H * 0.84, t: 0, life: 0.45, col });
        impact();
      });
      return;
    }
    const s = st.hero.s || 1;
    const sx = (st.hero.x || heroBaseX()) + 26 * s, sy = H * 0.84 - (wt === 'arco' ? 50 : 80) * s;
    const name = o.skillName || '';
    const multi = o.skill && /Chuva|Tormenta|Tempestade|Triplo/i.test(name) ? (/Triplo/.test(name) ? 3 : 6) : 1;
    const sky = o.skill && /Meteoro|Chuva|Tormenta|Ira|Tempestade/i.test(name);
    const kind = wt === 'arco' ? 'arrow' : wt === 'dardo' ? 'dart' : 'orb';
    const rel = dur * 0.4;
    for (let i = 0; i < multi; i++) {
      later(rel + i * 0.07, () => {
        const c = monCenter() || mc;
        const fromX = sky ? c.x + 80 - Math.random() * 60 : sx, fromY = sky ? -20 : sy;
        st.fx.push({ type: 'proj', kind, x0: fromX, y0: fromY, x1: c.x + (multi > 1 ? (Math.random() - 0.5) * 40 : 0), y1: c.y + (multi > 1 ? (Math.random() - 0.5) * 20 : 0), t: 0, life: sky ? 0.35 : 0.26, col, big: o.skill,
          onHit: i === multi - 1 ? () => { impact(); if (o.skill) st.fx.push({ type: 'ring', x: c.x, y: c.y, t: 0, life: 0.4, col }); } : () => burst(c.x, c.y, col, 6, 120) });
      });
    }
  }

  function monsterAttack(o) {
    if (!running || document.hidden || !st.mon) return;
    st.mon.atk = now();
    later(0.17, () => {
      st.hero.hurt = o.cls === 'miss' ? -9 : now();
      const s = st.hero.s || 1, hx = st.hero.x || heroBaseX();
      if (o.cls !== 'miss') { burst(hx, H * 0.84 - 45 * s, '#ff4040', 8, 100, 2.5); st.fx.push({ type: 'claw', x: hx, y: H * 0.84 - 50 * s, t: 0, life: 0.2 }); if (st.mon && st.mon.boss) shake = Math.max(shake, 5); }
      addFloat(hx, H * 0.84 - 105 * s, o.text, o.cls);
    });
  }

  function float(target, text, cls) {
    if (!running || document.hidden) return;
    const s = st.hero.s || 1;
    if (target === 'player') addFloat(st.hero.x || heroBaseX(), H * 0.84 - 105 * s, text, cls);
    else { const c = monCenter(); if (c) addFloat(c.x, st.mon.top, text, cls); }
  }
  function heal() {
    if (!running || document.hidden) return;
    const s = st.hero.s || 1, hx = st.hero.x || heroBaseX();
    for (let i = 0; i < 16; i++) st.parts.push({ x: hx + (Math.random() - 0.5) * 40 * s, y: H * 0.84 - Math.random() * 60 * s, vx: 0, vy: -50 - Math.random() * 40, life: 0.9, t: 0, col: '#70f080', size: 3, g: 0, plus: true });
  }
  function buff() {
    if (!running || document.hidden) return;
    const s = st.hero.s || 1;
    st.hero.cast = now();
    st.fx.push({ type: 'ring', x: st.hero.x || heroBaseX(), y: H * 0.84, t: 0, life: 0.6, col: '#ffd860' });
    for (let i = 0; i < 14; i++) st.parts.push({ x: (st.hero.x || heroBaseX()) + (Math.random() - 0.5) * 50 * s, y: H * 0.84, vx: 0, vy: -90 - Math.random() * 60, life: 0.8, t: 0, col: '#ffe080', size: 2.5, g: 0 });
  }
  function levelUp() {
    if (!running || document.hidden) return;
    st.fx.push({ type: 'pillar', t: 0, life: 1.4 });
    addFloat(st.hero.x || heroBaseX(), H * 0.84 - 130 * (st.hero.s || 1), 'LEVEL UP!', 'lvl');
  }

  // ---------- sincronização com o estado do jogo ----------
  function sync(t) {
    const m = R.mon;
    if (m && (!st.mon || st.mon.sid !== m.sid)) {
      if (st.mon && !st.mon.dieAt) { st.mon.dieAt = t; st.dying.push(st.mon); }
      const look = MON[m.name] || ['slime', '#888888'];
      st.mon = { sid: m.sid, kind: look[0], color: look[1], extra: look[2], boss: m.boss, x: W + 80, seed: Math.random() * 10, hurt: -9, atk: 0, born: t };
      if (m.boss) shake = Math.max(shake, 6);
    }
    if (!m && st.mon) {
      const pending = st.timers.length ? Math.max(...st.timers.map((x) => x.at)) - t + 0.25 : 0;
      const hasProj = st.fx.some((f) => f.type === 'proj');
      st.mon.dieAt = t + Math.max(0, pending) + (hasProj ? 0.25 : 0.05);
      const dm = st.mon;
      later(Math.max(0, dm.dieAt - t), () => { const c = { x: dm.x, y: H * 0.84 - 35 }; burst(c.x, c.y, dm.color, dm.boss ? 50 : 18, dm.boss ? 260 : 160, 4); if (dm.boss) shake = 12; });
      st.dying.push(dm);
      st.mon = null;
    }
    const busy = st.dying.some((d) => t < d.dieAt + 0.3);
    st.hero.state = !st.mon && !(R.dead > 0) && !busy ? 'run' : 'idle';
  }

  // ---------- loop ----------
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden || !S) return;
    const t = now();
    const dt = Math.min(0.05, t - (lastT || t)); lastT = t;
    sync(t);
    // timers
    const due = st.timers.filter((x) => x.at <= t);
    st.timers = st.timers.filter((x) => x.at > t);
    for (const d of due) d.fn();
    if (st.hero.state === 'run') scroll += 170 * dt;
    // monstro entrando
    if (st.mon) {
      const target = monBaseX(st.mon.boss);
      st.mon.x = st.mon.x > target ? Math.max(target, st.mon.x - (st.hero.state === 'run' ? 0 : 900) * dt - 170 * dt) : target;
    }
    for (const d of st.dying) { if (st.hero.state === 'run') d.x -= 170 * dt; }
    st.dying = st.dying.filter((d) => t < d.dieAt + 0.8);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 40); }
    drawBackground(t);
    for (const d of st.dying) drawMonster(d, t);
    if (st.mon) drawMonster(st.mon, t);
    drawHero(t);
    // efeitos
    for (const f of st.fx) {
      f.t += dt; const p = clamp(f.t / f.life, 0, 1);
      if (f.type === 'proj') {
        const x = lerp(f.x0, f.x1, p), y = lerp(f.y0, f.y1, p) - Math.sin(p * Math.PI) * (f.kind === 'arrow' || f.kind === 'dart' ? 18 : 0);
        const ang = Math.atan2(f.y1 - f.y0, f.x1 - f.x0);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        if (f.kind === 'orb') {
          const r = f.big ? 11 : 7;
          ctx.fillStyle = f.col; ctx.shadowColor = f.col; ctx.shadowBlur = 20; circ(0, 0, r); ctx.fill();
          ctx.fillStyle = '#fff'; circ(0, 0, r * 0.45); ctx.fill(); ctx.shadowBlur = 0;
          st.parts.push({ x, y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.3, t: 0, col: f.col, size: r * 0.5, g: 0 });
        } else {
          ctx.strokeStyle = f.big ? f.col : '#8a6a40'; ctx.lineWidth = f.kind === 'dart' ? 3 : 2;
          ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(6, 0); ctx.stroke();
          ctx.fillStyle = '#e8ecf4'; ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(14, 0); ctx.lineTo(6, 4); ctx.fill();
          if (f.big) { ctx.shadowColor = f.col; ctx.shadowBlur = 14; ctx.strokeStyle = f.col; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-10, 0); ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
        }
        ctx.restore();
        if (p >= 1 && !f.done) { f.done = true; f.onHit && f.onHit(); }
      } else if (f.type === 'slash') {
        ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.col; ctx.lineWidth = f.big ? 7 : 4; ctx.shadowColor = f.col; ctx.shadowBlur = 12; ctx.lineCap = 'round';
        const r = (f.big ? 52 : 38) * (0.7 + p * 0.5);
        ctx.beginPath(); ctx.arc(f.x - 10, f.y, r, -1.9, -1.9 + 2.6 * ease(clamp(p * 2, 0, 1))); ctx.stroke();
        if (f.big) { ctx.beginPath(); ctx.arc(f.x - 6, f.y + 6, r * 0.75, -1.6, -1.6 + 2.4 * ease(clamp(p * 2, 0, 1))); ctx.stroke(); }
        ctx.restore();
      } else if (f.type === 'claw') {
        ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#ff5050'; ctx.lineWidth = 3;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(f.x - 12 + i * 8, f.y - 14); ctx.lineTo(f.x + 8 + i * 8, f.y + 14); ctx.stroke(); }
        ctx.restore();
      } else if (f.type === 'ring') {
        ctx.save(); ctx.globalAlpha = (1 - p) * 0.9; ctx.strokeStyle = f.col; ctx.lineWidth = 4 * (1 - p) + 1; ctx.shadowColor = f.col; ctx.shadowBlur = 12;
        ell(f.x, f.y, 10 + p * 80, (10 + p * 80) * 0.3); ctx.stroke(); ctx.restore();
      } else if (f.type === 'pillar') {
        const hx = st.hero.x || heroBaseX();
        const g = ctx.createLinearGradient(hx - 40, 0, hx + 40, 0);
        g.addColorStop(0, 'rgba(255,220,100,0)'); g.addColorStop(0.5, `rgba(255,230,140,${0.6 * (1 - p)})`); g.addColorStop(1, 'rgba(255,220,100,0)');
        ctx.fillStyle = g; ctx.fillRect(hx - 40, 0, 80, H * 0.86);
        if (Math.random() < 0.6) st.parts.push({ x: hx + (Math.random() - 0.5) * 50, y: H * 0.84, vx: 0, vy: -160, life: 0.8, t: 0, col: '#ffe080', size: 2.5, g: 0 });
      }
    }
    st.fx = st.fx.filter((f) => f.t < f.life || (f.type === 'proj' && !f.done));
    // partículas
    for (const p of st.parts) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1); ctx.fillStyle = p.col;
      if (p.plus) { ctx.fillRect(p.x - 4, p.y - 1, 8, 2); ctx.fillRect(p.x - 1, p.y - 4, 2, 8); }
      else { circ(p.x, p.y, p.size); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    st.parts = st.parts.filter((p) => p.t < p.life);
    if (st.parts.length > 400) st.parts.splice(0, st.parts.length - 400);
    ambient(dt, t);
    // números flutuantes
    const fs = clamp(W / 40, 13, 20);
    for (const f of st.floats) {
      f.t += dt;
      const p = f.t / 1.0;
      const sz = { crit: 1.5, skill: 1.25, lvl: 1.6, miss: 0.85 }[f.cls] || 1;
      const pop = p < 0.12 ? 0.6 + p / 0.12 * 0.6 : 1.2 - Math.min(0.2, (p - 0.12));
      ctx.font = `800 ${Math.round(fs * sz * pop)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = clamp(1.4 - p * 1.4, 0, 1);
      const y = f.y - ease(Math.min(1, p)) * 45;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = { crit: '#ffa030', skill: '#ffe050', hurt: '#ff5a5a', heal: '#6af07a', miss: '#d0d0d0', lvl: '#ffe080' }[f.cls] || '#ffffff';
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
    st.floats = st.floats.filter((f) => f.t < 1.0);
    // vinheta
    const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, W * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = vg; ctx.fillRect(-10, -10, W + 20, H + 20);
    if (R.dead > 0) { ctx.fillStyle = 'rgba(40,0,0,.35)'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  function resize() {
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(160, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }

  function start(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    st.mon = null; st.dying = []; st.fx = []; st.parts = []; st.floats = []; st.timers = []; st.amb = [];
    st.hero = { atk: null, hurt: -9, cast: -9 };
    if (ro) { ro.disconnect(); ro.observe(cv); }
    resize();
    if (!running) { running = true; lastT = 0; raf = requestAnimationFrame(frame); }
  }
  function stop() { running = false; cancelAnimationFrame(raf); }
  window.addEventListener('resize', resize);
  const ro = window.ResizeObserver ? new ResizeObserver(() => resize()) : null;

  return { start, stop, resize, playerAttack, monsterAttack, float, heal, buff, levelUp, LOOK, MON, THEMES, RANGED };
})();
