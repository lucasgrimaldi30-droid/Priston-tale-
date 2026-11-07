// ============================================================
//  Crônicas de Valdária — cena de batalha 3D (Three.js r128)
//  Mesma interface da cena 2D. Lê S e R do jogo.
// ============================================================

const Scene3D = (() => {
  const ok = typeof THREE !== 'undefined' && (() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  })();
  const NOOP = () => {};
  if (!ok) return { ok: false, start: NOOP, stop: NOOP, resize: NOOP, playerAttack: NOOP, monsterAttack: NOOP, float: NOOP, heal: NOOP, buff: NOOP, levelUp: NOOP };

  const { LOOK, MON, THEMES, RANGED } = Scene2D;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const now = () => performance.now() / 1000;
  const rand = (a, b) => a + Math.random() * (b - a);
  const col = (c) => new THREE.Color(c);

  let renderer = null, scene, camera, cv, layer, running = false, raf = 0, W = 600, H = 320, lastT = 0;
  let env = null, curZone = null, curCls = null, weaponKey = '';
  const st = { hero: null, mon: null, dying: [], fx: [], timers: [], shake: 0, run: false };
  const RUN_SPEED = 3.4, GROUND = 0;

  // ---------- texturas ----------
  function glowTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  let GLOW = null;
  function glowSprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
    s.scale.set(size, size, 1);
    return s;
  }
  function skyTex(top, bottom) {
    const c = document.createElement('canvas'); c.width = 2; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top); gr.addColorStop(0.75, bottom); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
    return new THREE.CanvasTexture(c);
  }
  function groundTex(a, b) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = a; g.fillRect(0, 0, 256, 256);
    const ca = col(a), cb = col(b);
    for (let i = 0; i < 260; i++) {
      const t = Math.random(), cc = ca.clone().lerp(cb, t * 0.8);
      g.fillStyle = `rgba(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0},${0.25 + Math.random() * 0.35})`;
      const x = Math.random() * 256, y = Math.random() * 256, r = 2 + Math.random() * 14;
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.beginPath(); g.ellipse(x + dx, y + dy, r, r * 0.6, 0, 0, Math.PI * 2); g.fill(); }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 6);
    return t;
  }

  // ---------- construção básica ----------
  function matFactory(list) {
    return (color, o = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.8, metalness: Math.min(0.2, o.m ?? 0), flatShading: o.flat ?? true, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.op, opacity: o.op ?? 1 });
      m.userData.baseEmissive = m.emissive.clone(); m.userData.baseEI = m.emissiveIntensity;
      list && list.push(m);
      return m;
    };
  }
  function mk(geo, mat, parent, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = false;
    if (parent) parent.add(m);
    return m;
  }
  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    sph: (r, s = 12) => new THREE.SphereGeometry(r, s, Math.max(6, s * 0.75 | 0)),
    cyl: (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s),
    cone: (r, h, s = 10) => new THREE.ConeGeometry(r, h, s),
    ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
    dod: (r) => new THREE.DodecahedronGeometry(r, 0),
    oct: (r) => new THREE.OctahedronGeometry(r, 0),
    torus: (r, t, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, 20, arc),
  };
  const group = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; };

  function setFlash(mats, amt, color = 0xffffff) {
    for (const m of mats) {
      if (amt > 0) { m.emissive.set(color); m.emissiveIntensity = amt; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEI; }
    }
  }
  function setOpacity(mats, o) { for (const m of mats) { m.transparent = true; m.opacity = o; } }

  // ---------- armas ----------
  function buildWeapon(wt, L, M) {
    const w = group(null);
    const wood = M('#6a4a2a'), steel = M('#d8dde8', { m: 0.6, r: 0.3 }), gold = M('#e0b040', { m: 0.7, r: 0.35 });
    const glowMats = [];
    switch (wt) {
      case 'espada':
        mk(G.cyl(0.03, 0.03, 0.2, 6), wood, w, 0, 0.02, 0);
        mk(G.box(0.08, 0.04, 0.28), gold, w, 0, -0.1, 0);
        { const b = mk(G.box(0.07, 0.95, 0.025), steel, w, 0, -0.6, 0); glowMats.push(b.material); }
        mk(G.cone(0.05, 0.12, 4), steel, w, 0, -1.13, 0).rotation.z = Math.PI;
        break;
      case 'machado':
        mk(G.cyl(0.035, 0.035, 1.0, 6), wood, w, 0, -0.38, 0);
        { const h = mk(G.cyl(0.26, 0.26, 0.04, 12, 1), steel, w, 0.14, -0.78, 0); h.rotation.x = Math.PI / 2; h.scale.set(1, 1, 1); glowMats.push(h.material); }
        mk(G.box(0.14, 0.18, 0.06), steel, w, -0.07, -0.78, 0);
        break;
      case 'martelo':
        mk(G.cyl(0.035, 0.035, 0.95, 6), wood, w, 0, -0.36, 0);
        { const h = mk(G.box(0.42, 0.24, 0.24), M('#8a929e', { m: 0.5, r: 0.4 }), w, 0, -0.84, 0); glowMats.push(h.material); }
        mk(G.box(0.44, 0.06, 0.26), M('#60d8ff', { e: '#40c0ff', ei: 0.8 }), w, 0, -0.84, 0);
        break;
      case 'lanca':
        mk(G.cyl(0.03, 0.03, 2.0, 6), wood, w, 0, -0.5, 0);
        { const tip = mk(G.cone(0.07, 0.3, 4), steel, w, 0, -1.65, 0); tip.rotation.z = Math.PI; glowMats.push(tip.material); }
        mk(G.box(0.12, 0.05, 0.12), M(L.hair), w, 0, -1.45, 0);
        break;
      case 'dardo':
        mk(G.cyl(0.025, 0.025, 1.1, 6), M('#8a6a40'), w, 0, -0.35, 0);
        { const tip = mk(G.cone(0.06, 0.22, 4), steel, w, 0, -1.0, 0); tip.rotation.z = Math.PI; glowMats.push(tip.material); }
        mk(G.box(0.12, 0.12, 0.01), M('#f0f0f0'), w, 0, 0.18, 0);
        break;
      case 'cajado': {
        mk(G.cyl(0.035, 0.04, 1.5, 6), M('#5a3a20'), w, 0, -0.45, 0);
        const orb = mk(G.ico(0.13, 1), M('#c080ff', { e: '#a050ff', ei: 1.2, flat: false }), w, 0, -1.25, 0);
        const gl = glowSprite('#c080ff', 0.8, 0.7); gl.position.set(0, -1.25, 0); w.add(gl);
        w.userData.orb = orb; w.userData.glow = gl; glowMats.push(orb.material);
        break;
      }
      case 'cetro': {
        mk(G.cyl(0.03, 0.03, 0.7, 6), gold, w, 0, -0.25, 0);
        mk(G.torus(0.12, 0.025), gold, w, 0, -0.7, 0);
        const gem = mk(G.oct(0.08), M('#fff0a0', { e: '#ffe070', ei: 1.2 }), w, 0, -0.7, 0);
        const gl = glowSprite('#ffe680', 0.7, 0.7); gl.position.set(0, -0.7, 0); w.add(gl);
        w.userData.orb = gem; w.userData.glow = gl; glowMats.push(gem.material);
        break;
      }
      case 'arco': {
        const arc = Math.PI * 0.75, R = 0.55;
        const bow = mk(G.torus(R, 0.03, arc), M('#7a5030'), w, 0, 0, 0);
        bow.rotation.z = -Math.PI / 2 - arc / 2; bow.position.y = R * 0.75;
        const yEnd = R * 0.75 - R * Math.cos(arc / 2), xEnd = R * Math.sin(arc / 2);
        const str = mk(G.cyl(0.006, 0.006, xEnd * 2, 3), M('#eeeeee'), w, 0, yEnd, 0, false);
        str.rotation.z = Math.PI / 2;
        w.userData.string = str; w.userData.stringY = yEnd;
        const arrow = group(w, 0, yEnd, 0);
        mk(G.cyl(0.015, 0.015, 0.8, 4), M('#8a6a40'), arrow, 0, -0.35, 0);
        mk(G.cone(0.035, 0.1, 4), steel, arrow, 0, -0.78, 0).rotation.z = Math.PI;
        w.userData.arrow = arrow;
        glowMats.push(bow.material);
        break;
      }
    }
    w.userData.glowMats = glowMats;
    return w;
  }

  // ---------- capacetes / cabelo ----------
  function buildHead(head, L, M) {
    const skin = M(L.skin, { flat: false });
    mk(G.sph(0.3, 16), skin, head, 0, 0.28, 0);
    const eye = M('#1a1010');
    mk(G.sph(0.04, 6), eye, head, 0.27, 0.3, 0.1); mk(G.sph(0.04, 6), eye, head, 0.27, 0.3, -0.1);
    const hair = M(L.hair), body = M(L.body), trim = M(L.trim, { m: 0.5, r: 0.4 });
    switch (L.head) {
      case 'mohawk':
        for (let i = 0; i < 5; i++) mk(G.box(0.08, 0.16 + (i % 2) * 0.05, 0.06), hair, head, -0.18 + i * 0.09, 0.6, 0);
        break;
      case 'goggles':
        mk(G.sph(0.31, 12), hair, head, -0.03, 0.34, 0).scale.set(1, 0.6, 1);
        mk(G.cyl(0.31, 0.31, 0.06, 14), M('#333'), head, 0, 0.42, 0);
        mk(G.cyl(0.07, 0.07, 0.05, 10), M('#60e0ff', { e: '#30a0d0', ei: 0.6 }), head, 0.26, 0.44, 0.1).rotation.z = Math.PI / 2;
        mk(G.cyl(0.07, 0.07, 0.05, 10), M('#60e0ff', { e: '#30a0d0', ei: 0.6 }), head, 0.26, 0.44, -0.1).rotation.z = Math.PI / 2;
        break;
      case 'ponytail':
        mk(G.sph(0.32, 12), hair, head, -0.04, 0.35, 0).scale.set(1, 0.7, 1.02);
        mk(G.sph(0.12, 8), hair, head, -0.3, 0.3, 0).scale.set(1, 2, 1);
        break;
      case 'plume':
        mk(G.sph(0.33, 12), M('#9aa4b4', { m: 0.6, r: 0.35 }), head, 0, 0.32, 0).scale.set(1, 0.75, 1);
        mk(G.sph(0.09, 8), hair, head, -0.1, 0.62, 0).scale.set(2.2, 1, 0.6);
        break;
      case 'helm':
        mk(G.sph(0.34, 14), M('#c8ccd8', { m: 0.7, r: 0.3 }), head, 0, 0.3, 0).scale.set(1, 0.85, 1);
        mk(G.box(0.4, 0.05, 0.05), M('#222'), head, 0.2, 0.3, 0).rotation.y = Math.PI / 2;
        mk(G.box(0.36, 0.06, 0.04), trim, head, 0, 0.62, 0);
        break;
      case 'winged':
        mk(G.sph(0.33, 12), M('#c8d0e0', { m: 0.6, r: 0.3 }), head, 0, 0.34, 0).scale.set(1, 0.7, 1);
        for (const z of [0.3, -0.3]) { const wg = mk(G.box(0.3, 0.16, 0.02), M('#ffffff'), head, -0.1, 0.5, z); wg.rotation.z = 0.6; }
        mk(G.sph(0.12, 8), hair, head, -0.25, 0.15, 0).scale.set(1, 2, 1.4);
        break;
      case 'wizard':
        mk(G.cyl(0.46, 0.46, 0.04, 16), body, head, 0, 0.48, 0);
        mk(G.cone(0.3, 0.7, 12), body, head, -0.08, 0.84, 0).rotation.z = 0.25;
        mk(G.cyl(0.31, 0.31, 0.07, 16), trim, head, 0, 0.52, 0);
        mk(G.cone(0.1, 0.3, 6), hair, head, 0.22, 0.02, 0).rotation.z = Math.PI;
        break;
      case 'hood': {
        const hood = mk(G.sph(0.35, 14, 0), body, head, -0.04, 0.3, 0);
        hood.scale.set(1, 1, 1.05);
        mk(G.sph(0.29, 14), skin, head, 0.05, 0.27, 0);
        mk(G.torus(0.2, 0.025), M('#ffe070', { e: '#ffd040', ei: 1 }), head, 0, 0.78, 0).rotation.x = Math.PI / 2;
        mk(G.sph(0.04, 6), eye, head, 0.32, 0.3, 0.1); mk(G.sph(0.04, 6), eye, head, 0.32, 0.3, -0.1);
        break;
      }
    }
  }

  // ---------- herói ----------
  function buildHero(cls) {
    const L = LOOK[cls], wt = CLASSES[cls].weapon, mats = [];
    const M = matFactory(mats);
    const root = group(null);
    const inner = group(root);            // rotacionado para a câmera
    inner.rotation.y = -0.45;
    const hips = group(inner, 0, 0.72, 0);
    const pants = M(L.pants), boots = M(new THREE.Color(L.pants).multiplyScalar(0.55).getStyle());
    const legs = [];
    for (const z of [-0.12, 0.12]) {
      const lg = group(hips, 0, 0, z);
      mk(G.box(0.17, 0.62, 0.18), pants, lg, 0, -0.31, 0);
      mk(G.box(0.24, 0.12, 0.22), boots, lg, 0.04, -0.66, 0);
      legs.push(lg);
    }
    const torso = group(hips, 0, 0, 0);
    const bodyM = M(L.body, { m: L.robe ? 0 : 0.35, r: 0.55 }), trimM = M(L.trim, { m: 0.6, r: 0.35 });
    mk(G.box(0.46, 0.56, 0.34), bodyM, torso, 0, 0.3, 0);
    mk(G.box(0.48, 0.08, 0.36), trimM, torso, 0, 0.06, 0);
    if (L.robe) {
      mk(G.cyl(0.25, 0.44, 0.78, 12), bodyM, torso, 0, -0.33, 0);
      mk(G.cyl(0.445, 0.445, 0.06, 12), trimM, torso, 0, -0.69, 0);
      mk(G.box(0.05, 0.8, 0.02), trimM, torso, 0.27, -0.1, 0).rotation.z = -0.15;
    }
    for (const z of [-0.27, 0.27]) mk(G.sph(0.13, 8), trimM, torso, 0, 0.55, z);
    const armM = L.bare ? M(L.skin, { flat: false }) : M(new THREE.Color(L.body).multiplyScalar(0.85).getStyle(), { m: 0.3 });
    const skinM = M(L.skin, { flat: false });
    const arms = [];
    for (const z of [-0.3, 0.3]) {
      const a = group(torso, 0, 0.5, z);
      mk(G.box(0.14, 0.5, 0.14), armM, a, 0, -0.25, 0);
      mk(G.sph(0.085, 8), skinM, a, 0, -0.52, 0);
      const hand = group(a, 0, -0.52, 0);
      a.userData.hand = hand;
      arms.push(a);
    }
    const head = group(torso, 0, 0.6, 0);
    buildHead(head, L, M);
    // arma na mão da frente
    const weapon = buildWeapon(wt, L, M);
    arms[1].userData.hand.add(weapon);
    if (wt === 'arco') weapon.rotation.y = 0;
    // escudo do paladino
    if (wt === 'espada') {
      const sh = group(arms[0].userData.hand, 0.12, 0, 0);
      mk(G.box(0.06, 0.55, 0.42), M('#c8ccd8', { m: 0.6, r: 0.35 }), sh, 0, 0, 0);
      mk(G.box(0.07, 0.42, 0.07), M('#e0b040', { m: 0.7 }), sh, 0.01, 0, 0);
      mk(G.box(0.07, 0.07, 0.3), M('#e0b040', { m: 0.7 }), sh, 0.01, 0.07, 0);
    }
    // aura de buff
    const aura = mk(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: '#ffd860', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), root, 0, 0.03, 0, false);
    aura.rotation.x = -Math.PI / 2;
    const auraGlow = glowSprite('#ffd860', 2.4, 0); auraGlow.position.set(0, 1, 0); root.add(auraGlow);
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    aura.castShadow = false;
    return { root, inner, hips, legs, torso, arms, head, weapon, mats, wt, aura, auraGlow, atk: null, hurt: -9, x: 0 };
  }

  function updateWeaponLook() {
    const h = st.hero; if (!h || !S.equip.arma) return;
    const it = S.equip.arma, key = it.uid + ':' + it.refine;
    if (key === weaponKey) return;
    weaponKey = key;
    const rar = RARITIES.find((r) => r.id === it.rarity) || RARITIES[0];
    const ri = RARITIES.indexOf(rar);
    const amt = (ri > 0 ? 0.15 + ri * 0.08 : 0) + (it.refine || 0) * 0.06;
    for (const m of h.weapon.userData.glowMats) {
      m.userData.baseEmissive = amt > 0 ? new THREE.Color(rar.id === 'comum' ? '#ffffff' : rar.color) : new THREE.Color(0);
      m.userData.baseEI = amt;
      m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = amt;
    }
  }

  // ---------- monstros ----------
  function buildMonster(name, boss) {
    const look = MON[name] || ['slime', '#888888'];
    const [kind, color, extra] = look;
    const mats = [], M = matFactory(mats);
    const c = new THREE.Color(color);
    const dk = c.clone().multiplyScalar(0.6).getStyle(), lt = c.clone().lerp(new THREE.Color('#ffffff'), 0.3).getStyle();
    const root = group(null), inner = group(root);
    inner.rotation.y = 0.45;
    const body = group(inner);
    const P = { legs: [], arms: [], wings: [], segs: [], tent: [], float: 0, bob: 0 };
    const red = () => M('#ff3030', { e: '#ff2020', ei: 1.5 });
    const eyes = (parent, x, y, z, r = 0.06, glow = false) => {
      for (const s of [-1, 1]) {
        if (glow) { mk(G.sph(r, 6), red(), parent, x, y, z * s); continue; }
        mk(G.sph(r, 8), M('#ffffff'), parent, x, y, z * s);
        mk(G.sph(r * 0.55, 6), M(boss ? '#d02020' : '#111111'), parent, x - r * 0.6, y, z * s);
      }
    };
    const base = M(color), dark = M(dk), light = M(lt);
    switch (kind) {
      case 'slime': {
        const b = mk(G.sph(0.55, 16), M(color, { flat: false, r: 0.25, op: 0.92 }), body, 0, 0.42, 0); b.scale.set(1.1, 0.8, 1);
        mk(G.sph(0.12, 8), M(lt, { flat: false, r: 0.2 }), body, -0.18, 0.7, 0.2);
        if (extra === 'frog') { for (const z of [-0.2, 0.2]) { mk(G.sph(0.14, 10), base, body, -0.2, 0.8, z); } eyes(body, -0.3, 0.84, 0.2, 0.08); }
        else eyes(body, -0.5, 0.5, 0.15, 0.08);
        if (extra === 'teeth') for (let i = 0; i < 5; i++) mk(G.cone(0.05, 0.12, 4), M('#ffffff'), body, -0.55, 0.3, -0.2 + i * 0.1).rotation.z = Math.PI;
        P.squash = b;
        break;
      }
      case 'beast': {
        const sc = extra === 'ears' ? 0.7 : 1;
        body.scale.setScalar(sc);
        const b = mk(G.sph(0.5, 12), base, body, 0, 0.75, 0); b.scale.set(1.5, 0.75, 0.8);
        const head = group(body, -0.72, 0.95, 0);
        mk(G.sph(0.3, 12), base, head, 0, 0, 0);
        mk(G.box(0.3, 0.2, 0.24), light, head, -0.25, -0.06, 0);
        mk(G.sph(0.05, 6), M('#111'), head, -0.41, -0.02, 0);
        eyes(head, -0.2, 0.1, 0.15, 0.06);
        if (extra === 'ears') for (const z of [-0.1, 0.1]) { const e = mk(G.sph(0.08, 8), base, head, 0.05, 0.38, z); e.scale.set(0.8, 3, 0.6); }
        else for (const z of [-0.14, 0.14]) mk(G.cone(0.08, 0.2, 4), base, head, 0.05, 0.3, z);
        if (extra === 'tusks') for (const z of [-0.12, 0.12]) { const t = mk(G.cone(0.04, 0.25, 6), M('#f8f0d8'), head, -0.3, 0.02, z); t.rotation.z = 2.2; }
        for (const [x, z, ph] of [[-0.45, 0.2, 0], [-0.45, -0.2, Math.PI], [0.45, 0.2, Math.PI], [0.45, -0.2, 0]]) {
          const lg = group(body, x, 0.55, z); mk(G.cyl(0.08, 0.06, 0.55, 6), dark, lg, 0, -0.27, 0); lg.userData.ph = ph; P.legs.push(lg);
        }
        const tail = group(body, 0.7, 0.85, 0); mk(G.cyl(0.05, 0.03, 0.5, 6), base, tail, 0.15, 0.2, 0).rotation.z = -0.8; P.tail = tail;
        if (extra === 'flame') for (let i = 0; i < 4; i++) { const f = mk(G.cone(0.1, 0.35, 5), M('#ff8020', { e: '#ff5010', ei: 1.5 }), body, -0.3 + i * 0.2, 1.15, 0); P.segs.push(f); }
        break;
      }
      case 'humanoid': case 'skeleton': {
        const bone = kind === 'skeleton';
        const sc = extra === 'cyclops' ? 1.4 : 1;
        body.scale.setScalar(sc);
        const hips = group(body, 0, 0.72, 0);
        const limbM = bone ? base : dark;
        for (const z of [-0.12, 0.12]) { const lg = group(hips, 0, 0, z); mk(G.cyl(bone ? 0.04 : 0.09, bone ? 0.04 : 0.08, 0.7, 6), limbM, lg, 0, -0.35, 0); lg.userData.ph = z > 0 ? 0 : Math.PI; P.legs.push(lg); }
        const torso = group(hips);
        if (bone) {
          mk(G.cyl(0.04, 0.04, 0.6, 6), base, torso, 0, 0.3, 0);
          for (let i = 0; i < 4; i++) { const r = mk(G.torus(0.17 - i * 0.015, 0.025), base, torso, 0, 0.25 + i * 0.1, 0); r.rotation.x = Math.PI / 2; }
          if (extra === 'crown') mk(G.cyl(0.22, 0.48, 1.3, 10), M('#2a1a40'), torso, 0, -0.1, 0);
        } else {
          mk(G.box(0.48, 0.6, 0.36), base, torso, 0, 0.3, 0);
          if (extra === 'wrap') for (let i = 0; i < 5; i++) mk(G.box(0.5, 0.03, 0.38), M('#bfb08a'), torso, 0, 0.08 + i * 0.12, 0).rotation.x = 0.1;
        }
        for (const z of [-0.3, 0.3]) {
          const a = group(torso, 0, 0.52, z);
          mk(G.cyl(bone ? 0.035 : 0.08, bone ? 0.035 : 0.07, 0.55, 6), bone ? base : (extra === 'wrap' ? base : dark), a, 0, -0.27, 0);
          if (z > 0 && (extra === 'horns' || boss || bone)) { const sw = mk(G.box(0.06, 0.9, 0.03), M('#c8ccd4', { m: 0.6, r: 0.3 }), a, 0, -0.9, 0); sw.castShadow = true; }
          P.arms.push(a);
        }
        const head = group(torso, 0, 0.75, 0);
        mk(G.sph(bone ? 0.22 : 0.26, 12), base, head, 0, 0.12, 0);
        if (bone) { for (const z of [-0.08, 0.08]) mk(G.sph(0.06, 6), (extra === 'crown' || boss) ? red() : M('#111'), head, -0.17, 0.14, z); }
        else if (extra === 'cyclops') { mk(G.sph(0.11, 10), M('#ffffff'), head, -0.2, 0.16, 0); mk(G.sph(0.055, 8), M('#111'), head, -0.29, 0.16, 0); }
        else eyes(head, -0.22, 0.15, 0.09, 0.05, extra === 'horns');
        if (extra === 'ears') for (const z of [-1, 1]) { const e = mk(G.cone(0.06, 0.3, 4), base, head, 0, 0.18, 0.28 * z); e.rotation.x = z * 1.3; }
        if (extra === 'hat') { mk(G.cyl(0.4, 0.4, 0.03, 14), M('#201828'), head, 0, 0.3, 0); mk(G.cone(0.22, 0.6, 10), M('#201828'), head, 0.05, 0.6, 0).rotation.z = -0.3; }
        if (extra === 'horns') for (const z of [-0.14, 0.14]) { const h = mk(G.cone(0.05, 0.3, 6), M('#e0d8c0'), head, 0, 0.38, z); h.rotation.x = z > 0 ? 0.4 : -0.4; }
        if (extra === 'helmet') { mk(G.sph(0.25, 10), M('#c0a020', { m: 0.5 }), head, 0, 0.2, 0).scale.set(1, 0.6, 1); mk(G.sph(0.05, 6), M('#fff8a0', { e: '#fff080', ei: 2 }), head, -0.22, 0.28, 0); }
        if (extra === 'crown') for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; mk(G.cone(0.05, 0.16, 4), M('#f0c030', { m: 0.7, e: '#a07010', ei: 0.4 }), head, Math.cos(a) * 0.17, 0.35, Math.sin(a) * 0.17); }
        if (extra === 'wings') for (const z of [-1, 1]) { const wg = group(torso, 0.15, 0.5, 0.15 * z); const p = mk(G.box(0.7, 0.04, 0.9), M('#20202a'), wg, 0.3, 0, 0.4 * z); p.rotation.y = 0.3 * z; wg.userData.side = z; P.wings.push(wg); }
        P.torso = torso;
        break;
      }
      case 'flyer': {
        P.float = 1.6;
        mk(G.sph(0.28, 12), base, body, 0, 0, 0);
        if (extra === 'beak') { mk(G.sph(0.2, 10), M('#f0e8d8'), body, -0.22, 0.12, 0); mk(G.cone(0.07, 0.22, 4), M('#f0c040'), body, -0.42, 0.1, 0).rotation.z = Math.PI / 2; eyes(body, -0.36, 0.2, 0.08, 0.04); }
        else eyes(body, -0.24, 0.06, 0.09, 0.05, true);
        if (extra === 'horns') for (const z of [-0.1, 0.1]) mk(G.cone(0.04, 0.18, 4), M('#300'), body, -0.05, 0.3, z);
        for (const z of [-1, 1]) { const wg = group(body, 0, 0.05, 0.2 * z); const p = mk(G.box(0.5, 0.03, 0.75), dark, wg, 0, 0, 0.35 * z); p.rotation.y = 0.2 * z; wg.userData.side = z; P.wings.push(wg); }
        break;
      }
      case 'golem': {
        body.scale.setScalar(1.25);
        for (const z of [-0.2, 0.2]) { const lg = group(body, 0, 0.6, z); mk(G.box(0.26, 0.6, 0.28), dark, lg, 0, -0.3, 0); lg.userData.ph = z > 0 ? 0 : Math.PI; P.legs.push(lg); }
        const torso = group(body, 0, 0.6, 0);
        mk(G.box(0.85, 0.8, 0.6), base, torso, 0, 0.4, 0);
        mk(G.box(0.3, 0.2, 0.62), light, torso, -0.15, 0.6, 0);
        for (const z of [-0.55, 0.55]) { const a = group(torso, 0, 0.7, z); mk(G.box(0.26, 0.75, 0.26), M(c.clone().multiplyScalar(0.8).getStyle()), a, 0, -0.35, 0); mk(G.box(0.32, 0.25, 0.32), dark, a, 0, -0.78, 0); P.arms.push(a); }
        const head = group(torso, 0, 0.95, 0);
        mk(G.box(0.42, 0.36, 0.4), base, head, 0, 0.15, 0);
        if (extra === 'fur') eyes(head, -0.21, 0.2, 0.1, 0.05); else eyes(head, -0.21, 0.2, 0.1, 0.05, true);
        if (extra === 'flame') for (let i = 0; i < 5; i++) { const f = mk(G.cone(0.08, 0.35, 5), M('#ffa020', { e: '#ff6010', ei: 1.8 }), head, -0.15 + i * 0.08, 0.5, (i % 2 - 0.5) * 0.15); P.segs.push(f); }
        P.torso = torso;
        break;
      }
      case 'bug': {
        const b = mk(G.sph(0.4, 12), base, body, 0.2, 0.45, 0); b.scale.set(1.3, 0.75, 1);
        mk(G.sph(0.24, 10), dark, body, -0.4, 0.42, 0);
        for (const z of [-0.07, 0, 0.07]) mk(G.sph(0.04, 6), red(), body, -0.6, 0.5, z);
        for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
          const lg = group(body, -0.15 + i * 0.18, 0.45, 0.25 * s);
          const seg = mk(G.cyl(0.03, 0.03, 0.55, 5), dark, lg, 0, -0.1, 0.25 * s); seg.rotation.x = s * 1.0;
          lg.userData.ph = i + (s > 0 ? Math.PI : 0); P.legs.push(lg);
        }
        if (extra === 'tail') {
          let prev = group(body, 0.7, 0.55, 0);
          for (let i = 0; i < 5; i++) { mk(G.sph(0.13 - i * 0.015, 8), base, prev, 0, 0.12, 0); const n = group(prev, 0, 0.2, 0); n.rotation.z = -0.45; P.segs.push(prev); prev = n; }
          mk(G.cone(0.06, 0.2, 5), M('#300'), prev, 0, 0.1, 0);
        }
        break;
      }
      case 'serpent': {
        for (let i = 0; i < 9; i++) { const sg = mk(G.sph(0.24 - i * 0.015, 10), i % 2 ? base : dark, body, i * 0.24 - 0.4, 0.2, 0); P.segs.push(sg); }
        const head = group(body, -0.65, 0.75, 0); mk(G.sph(0.25, 10), base, head, 0, 0, 0).scale.set(1.3, 0.85, 1);
        eyes(head, -0.18, 0.1, 0.12, 0.05); P.head = head;
        break;
      }
      case 'ghost': {
        P.float = 0.5;
        const m = M(color, { e: color, ei: 0.5, op: 0.75, flat: false });
        mk(G.sph(0.42, 14), m, body, 0, 0.9, 0);
        const sk = mk(G.cyl(0.42, 0.25, 0.75, 14, 1), m, body, 0, 0.45, 0); sk.castShadow = false;
        for (const z of [-0.14, 0.14]) mk(G.sph(0.07, 6), M('#102030'), body, -0.38, 0.95, z).scale.set(0.6, 1.3, 1);
        mk(G.sph(0.08, 6), M('#102030'), body, -0.4, 0.75, 0).scale.set(0.6, 1.2, 1.3);
        const gl = glowSprite(color, 2.2, 0.35); gl.position.set(0, 0.8, 0); body.add(gl);
        break;
      }
      case 'plant': {
        mk(G.cyl(0.25, 0.32, 1.2, 8), M('#6a5030'), body, 0, 0.6, 0);
        for (const [x, y, z, r] of [[0, 1.45, 0, 0.5], [-0.3, 1.25, 0.25, 0.32], [0.3, 1.3, -0.2, 0.34]]) mk(G.ico(r), M('#4a8a30'), body, x, y, z);
        for (const z of [-0.25, 0.25]) mk(G.sph(0.06, 6), M('#2a1a0a'), body, -0.26, 0.85, z * 0.5);
        for (const z of [-0.3, 0.3]) { const a = group(body, 0, 0.9, z); mk(G.cyl(0.06, 0.04, 0.7, 5), M('#6a5030'), a, 0, -0.3, 0); P.arms.push(a); }
        break;
      }
      case 'eye': {
        P.float = 1.5;
        mk(G.sph(0.5, 16), M(color, { flat: false, e: color, ei: 0.3 }), body, 0, 0, 0);
        mk(G.sph(0.32, 14), M('#f0e8d8', { flat: false }), body, -0.25, 0, 0);
        mk(G.sph(0.16, 10), M('#c02040', { e: '#800020', ei: 0.6 }), body, -0.48, 0, 0);
        mk(G.sph(0.07, 8), M('#000000'), body, -0.6, 0, 0).scale.set(0.5, 1.5, 1);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2; let prev = group(body, Math.cos(a) * 0.25 + 0.1, -0.35, Math.sin(a) * 0.25);
          for (let j = 0; j < 4; j++) { mk(G.sph(0.07 - j * 0.012, 6), M(color), prev, 0, -0.12, 0); const n = group(prev, 0, -0.18, 0); P.tent.push({ g: prev, i, j }); prev = n; }
        }
        if (extra === 'crown') for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mk(G.cone(0.07, 0.35, 4), M('#c090ff', { e: '#8040ff', ei: 1 }), body, Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3); }
        const gl = glowSprite('#a040ff', 2.6, 0.4); body.add(gl);
        break;
      }
      case 'dragon': {
        body.scale.setScalar(1.1);
        const b = mk(G.sph(0.6, 12), base, body, 0.1, 0.9, 0); b.scale.set(1.5, 0.9, 0.9);
        for (const [x, z] of [[-0.4, 0.3], [-0.4, -0.3], [0.5, 0.3], [0.5, -0.3]]) { const lg = group(body, x, 0.6, z); mk(G.cyl(0.12, 0.1, 0.6, 6), dark, lg, 0, -0.3, 0); lg.userData.ph = x * 5 + z * 3; P.legs.push(lg); }
        const neck = mk(G.cyl(0.18, 0.25, 0.8, 8), base, body, -0.7, 1.35, 0); neck.rotation.z = 0.7;
        const head = group(body, -1.05, 1.7, 0); mk(G.box(0.55, 0.3, 0.35), base, head, -0.1, 0, 0); P.head = head;
        for (const z of [-0.1, 0.1]) { mk(G.cone(0.05, 0.3, 5), light, head, 0.15, 0.25, z).rotation.z = 0.6; mk(G.sph(0.05, 6), red(), head, -0.2, 0.08, z * 1.5); }
        let prev = group(body, 0.9, 0.9, 0);
        for (let i = 0; i < 6; i++) { mk(G.sph(0.2 - i * 0.025, 8), base, prev, 0.15, 0, 0); const n = group(prev, 0.25, 0, 0); P.segs.push(prev); prev = n; }
        for (const z of [-1, 1]) { const wg = group(body, 0.1, 1.3, 0.3 * z); const p = mk(G.box(1.1, 0.04, 1.3), M(dk, { op: 0.95 }), wg, 0.2, 0, 0.65 * z); p.rotation.y = -0.3 * z; wg.userData.side = z; P.wings.push(wg); }
        break;
      }
    }
    if (boss) {
      const ring = mk(new THREE.RingGeometry(0.9, 1.15, 40), new THREE.MeshBasicMaterial({ color: '#b060ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }), root, 0, 0.03, 0, false);
      ring.rotation.x = -Math.PI / 2; P.bossRing = ring;
    }
    root.scale.setScalar(boss ? 1.6 : 1);
    return { root, inner, body, P, mats, kind, extra, boss, color, seed: Math.random() * 10, hurt: -9, atk: 0 };
  }

  function animMonster(m, t, dt) {
    const P = m.P, ph = t * 6 + m.seed, wk = Math.sin(ph);
    let y = 0;
    if (P.float) y = P.float + Math.sin(t * 2.4 + m.seed) * 0.12;
    m.body.position.y = y;
    for (const lg of P.legs) lg.rotation.z = Math.sin(ph + (lg.userData.ph || 0)) * (m.kind === 'bug' ? 0.25 : 0.35);
    if (P.squash) { const s = 1 + Math.sin(t * 4 + m.seed) * 0.07; P.squash.scale.set(1.1 / s, 0.8 * s, 1 / s); }
    if (P.tail) P.tail.rotation.z = Math.sin(t * 5) * 0.4;
    const atkA = m.atk ? clamp((t - m.atk) / 0.4, 0, 1) : 0;
    P.arms.forEach((a, i) => { a.rotation.z = atkA ? -Math.sin(atkA * Math.PI) * 2.2 : -0.15 + Math.sin(ph + i * Math.PI) * 0.15; });
    for (const wg of P.wings) wg.rotation.x = wg.userData.side * (0.2 + Math.sin(t * (m.kind === 'dragon' ? 4 : 14)) * 0.6);
    P.segs.forEach((s, i) => {
      if (m.kind === 'serpent') s.position.y = 0.2 + Math.max(0, Math.sin(t * 5 - i * 0.7)) * 0.15;
      else if (m.kind === 'bug' || m.kind === 'dragon') s.rotation.y = Math.sin(t * 3 + i * 0.5) * 0.15;
      else s.scale.y = 0.8 + Math.abs(Math.sin(t * 9 + i)) * 0.6;
    });
    if (P.head && m.kind === 'serpent') { P.head.position.y = 0.75 + Math.sin(t * 2.5) * 0.08; }
    for (const tn of P.tent) tn.g.rotation.z = Math.sin(t * 3 + tn.i + tn.j * 0.6) * 0.35;
    if (P.bossRing) { P.bossRing.rotation.z += dt; P.bossRing.material.opacity = 0.4 + Math.sin(t * 3) * 0.15; }
  }

  // ---------- cenário ----------
  function buildProp(type, th, M) {
    const g = group(null);
    switch (type) {
      case 'tree':
        mk(G.cyl(0.15, 0.22, 1.4, 6), M('#5a3a20'), g, 0, 0.7, 0);
        for (const [x, y, z, r] of [[0, 1.9, 0, 0.8], [-0.45, 1.55, 0.2, 0.55], [0.45, 1.6, -0.15, 0.55]]) mk(G.ico(r), M(th.dc), g, x, y, z);
        break;
      case 'pine': {
        mk(G.cyl(0.12, 0.18, 0.8, 6), M('#4a3020'), g, 0, 0.4, 0);
        for (let i = 0; i < 3; i++) mk(G.cone(0.9 - i * 0.22, 1.1, 7), M(th.dc), g, 0, 1.0 + i * 0.6, 0);
        if (th.amb === 'snow') mk(G.cone(0.32, 0.4, 7), M('#ffffff'), g, 0, 2.55, 0);
        break;
      }
      case 'dead':
        mk(G.cyl(0.1, 0.18, 2, 5), M(th.dc), g, 0, 1, 0);
        for (const [y, r, l] of [[1.2, 0.8, 0.9], [1.6, -0.9, 0.8], [0.9, -0.6, 0.6]]) { const b = mk(G.cyl(0.04, 0.07, l, 4), M(th.dc), g, Math.sin(r) * l * 0.4, y + 0.2, 0); b.rotation.z = -r; }
        break;
      case 'crystal':
        for (let i = 0; i < 3; i++) { const cr = mk(G.oct(0.3), M(th.dc, { e: th.dc, ei: 0.9, r: 0.2, op: 0.85 }), g, (i - 1) * 0.3, 0.45 + (i === 1 ? 0.3 : 0), (i % 2) * 0.15); cr.scale.set(0.6, i === 1 ? 2.6 : 1.7, 0.6); cr.rotation.z = (i - 1) * 0.25; }
        { const gl = glowSprite(th.dc, 2.4, 0.5); gl.position.y = 0.8; g.add(gl); }
        break;
      case 'cactus':
        mk(G.cyl(0.2, 0.22, 1.6, 8), M(th.dc), g, 0, 0.8, 0);
        mk(G.cyl(0.12, 0.12, 0.6, 7), M(th.dc), g, -0.38, 1.1, 0); mk(G.cyl(0.12, 0.12, 0.3, 7), M(th.dc), g, -0.22, 0.85, 0).rotation.z = Math.PI / 2;
        mk(G.cyl(0.12, 0.12, 0.5, 7), M(th.dc), g, 0.36, 1.25, 0); mk(G.cyl(0.12, 0.12, 0.3, 7), M(th.dc), g, 0.22, 1.05, 0).rotation.z = Math.PI / 2;
        break;
      case 'tomb':
        mk(G.box(0.6, 0.7, 0.18), M(th.dc), g, 0, 0.35, 0);
        mk(G.cyl(0.3, 0.3, 0.18, 12), M(th.dc), g, 0, 0.7, 0).rotation.x = Math.PI / 2;
        mk(G.box(0.08, 0.35, 0.02), M('#3a3848'), g, 0, 0.55, 0.1); mk(G.box(0.25, 0.08, 0.02), M('#3a3848'), g, 0, 0.6, 0.1);
        break;
      case 'spike':
        for (const [x, h, z] of [[0, 2.6, 0], [0.5, 1.5, 0.2], [-0.45, 1.2, -0.1]]) mk(G.cone(0.32, h, 5), M(th.dc), g, x, h / 2, z);
        { const lava = mk(new THREE.CircleGeometry(0.9, 12), M('#ff5010', { e: '#ff4000', ei: 1.4 }), g, 0, 0.02, 0, false); lava.rotation.x = -Math.PI / 2; }
        break;
      case 'rock':
        { const r = mk(G.dod(0.7), M(th.dc), g, 0, 0.35, 0); r.scale.set(1.3, 0.7, 1); }
        mk(G.dod(0.35), M(th.dc), g, 0.7, 0.18, 0.2);
        break;
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  function buildEnv(zid) {
    if (env) { scene.remove(env.root); env.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map && o.material.map !== GLOW) o.material.map.dispose(); o.material.dispose(); } }); }
    const th = THEMES[zid] || THEMES.z1;
    const M = matFactory(null);
    const root = group(null);
    const dark = th.cave || th.amb === 'star' || th.amb === 'wisp';
    scene.background = skyTex(th.sky[0], th.sky[1]);
    scene.fog = new THREE.Fog(th.sky[1], 14, th.cave ? 28 : 42);
    // luzes
    const hemi = new THREE.HemisphereLight(th.sky[1], th.g[1], dark ? 0.7 : 0.85); root.add(hemi);
    const sunCol = th.amb === 'ember' ? '#ff9050' : dark ? '#a0b0ff' : '#fff4e0';
    const sun = new THREE.DirectionalLight(sunCol, dark ? 0.75 : 1.05);
    sun.position.set(1.5, 10, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -4, near: 1, far: 30 });
    sun.shadow.bias = -0.0015;
    root.add(sun); root.add(sun.target);
    const fill = new THREE.DirectionalLight('#ffffff', dark ? 0.55 : 0.35); fill.position.set(0, 3, 10); root.add(fill);
    const rim = new THREE.DirectionalLight(th.amb === 'ember' ? '#ff4010' : (dark ? th.dc : '#ffffff'), dark ? 0.6 : 0.25); rim.position.set(6, 4, -6); root.add(rim);
    // chão
    const gtex = groundTex(th.g[0], th.g[1]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 45), new THREE.MeshStandardMaterial({ map: gtex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = -10; ground.receiveShadow = true; root.add(ground);
    // montanhas e colinas
    const far = [], mid = [], props = [], scatter = [], ceil = [];
    for (let i = 0; i < 14; i++) {
      const h = rand(6, 14), m = mk(G.cone(rand(5, 9), h, 6), M(th.far), root, -45 + i * 6.5 + rand(-2, 2), h / 2 - 0.5, -34 + rand(-3, 3), false);
      m.rotation.y = rand(0, 3); far.push(m);
    }
    for (let i = 0; i < 12; i++) {
      const m = mk(G.sph(rand(3, 6), 8), M(th.mid), root, -40 + i * 7 + rand(-2, 2), -1, -20 + rand(-2, 2), false);
      m.scale.y = rand(0.4, 0.8); mid.push(m);
    }
    // objetos ao fundo e na frente
    for (let i = 0; i < 18; i++) {
      const p = buildProp(th.deco, th, M);
      p.position.set(-22 + i * 2.5 + rand(-0.8, 0.8), 0, -rand(3.2, 10));
      p.scale.setScalar(rand(0.8, 1.35)); p.rotation.y = rand(0, 6.28);
      root.add(p); props.push(p);
    }
    for (let i = 0; i < 4; i++) {
      const p = buildProp(th.deco === 'crystal' || th.deco === 'spike' ? th.deco : 'rock', th, M);
      p.position.set(-14 + i * 8 + rand(-2, 2), 0, rand(3.2, 4.2)); p.scale.setScalar(rand(0.35, 0.55));
      root.add(p); props.push(p);
    }
    const tuftM = M(new THREE.Color(th.g[0]).multiplyScalar(0.8).getStyle());
    for (let i = 0; i < 40; i++) {
      const t = mk(G.cone(0.06, rand(0.12, 0.3), 4), tuftM, root, rand(-20, 20), 0.08, rand(-3, 3), false);
      scatter.push(t);
    }
    if (th.cave) for (let i = 0; i < 16; i++) { const h = rand(1, 3); const s = mk(G.cone(rand(0.3, 0.7), h, 5), M('#2a2430'), root, -20 + i * 2.6, 6.5 - h / 2 + 1, -rand(2, 8), false); s.rotation.x = Math.PI; ceil.push(s); }
    // sol / lua / estrelas
    if (!th.cave) { const sunS = glowSprite(th.amb === 'ember' ? '#ff6020' : '#fff6d0', th.amb === 'star' ? 4 : 9, th.amb === 'star' ? 0.5 : 0.75); sunS.position.set(9, 9, -30); root.add(sunS); }
    let stars = null;
    if (th.amb === 'star') {
      const n = 300, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = rand(-50, 50); pos[i * 3 + 1] = rand(3, 25); pos[i * 3 + 2] = rand(-40, -30); }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      stars = new THREE.Points(gg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.15, transparent: true, opacity: 0.9, fog: false }));
      root.add(stars);
    }
    scene.add(root);
    env = { root, gtex, far, mid, props, scatter, ceil, th, stars };
  }

  function scrollEnv(dx) {
    if (!env) return;
    env.gtex.offset.x += dx / (90 / 12);
    const wrap = (arr, f, span) => { for (const o of arr) { o.position.x -= dx * f; if (o.position.x < -span) o.position.x += span * 2; } };
    wrap(env.far, 0.08, 46); wrap(env.mid, 0.3, 42); wrap(env.props, 1, 22.5); wrap(env.scatter, 1, 20); wrap(env.ceil, 1, 21);
  }

  // ---------- partículas (shader próprio) ----------
  const PMAX = 1800;
  let pts = null, pPos, pCol, pAlpha, pSize;
  const parts = [];
  function initParticles() {
    const g = new THREE.BufferGeometry();
    pPos = new Float32Array(PMAX * 3); pCol = new Float32Array(PMAX * 3); pAlpha = new Float32Array(PMAX); pSize = new Float32Array(PMAX);
    g.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(pCol, 3));
    g.setAttribute('palpha', new THREE.BufferAttribute(pAlpha, 1));
    g.setAttribute('psize', new THREE.BufferAttribute(pSize, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: `attribute vec3 pcolor; attribute float palpha; attribute float psize; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC=pcolor; vA=palpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=psize*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard; float a=smoothstep(0.5,0.05,d)*vA; gl_FragColor=vec4(vC*a*1.4,a); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    pts = new THREE.Points(g, mat); pts.frustumCulled = false;
    scene.add(pts);
  }
  function spawnP(p) { if (parts.length < PMAX) parts.push(Object.assign({ t: 0, g: 0, drag: 0, size: 0.12 }, p)); }
  function burst(pos, color, n = 14, spd = 3, size = 0.13, up = 1.5) {
    const c = col(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, v = spd * (0.3 + Math.random());
      spawnP({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * Math.cos(b) * v, vy: Math.sin(b) * v + up, vz: Math.sin(a) * Math.cos(b) * v, life: 0.4 + Math.random() * 0.45, r: c.r, gg: c.g, b: c.b, size: size * (0.6 + Math.random() * 0.8), g: -7 });
    }
  }
  function updateParticles(dt) {
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.scroll && st.run) p.x -= RUN_SPEED * dt;
    }
    for (const p of parts) {
      pPos[n * 3] = p.x; pPos[n * 3 + 1] = p.y; pPos[n * 3 + 2] = p.z;
      pCol[n * 3] = p.r; pCol[n * 3 + 1] = p.gg; pCol[n * 3 + 2] = p.b;
      const k = p.t / p.life;
      pAlpha[n] = p.fadeIn ? Math.min(1, p.t * 2) * (1 - k) : 1 - k * k;
      pSize[n] = p.size;
      n++;
    }
    for (let i = n; i < PMAX; i++) pAlpha[i] = 0;
    const g = pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.pcolor.needsUpdate = true; g.attributes.palpha.needsUpdate = true; g.attributes.psize.needsUpdate = true;
    g.setDrawRange(0, Math.max(1, n));
  }
  function ambient(dt) {
    const th = env.th, a = th.amb;
    const rate = { snow: 40, ember: 25, leaf: 6, firefly: 10, wisp: 8, bubble: 10, sand: 30, dust: 10, star: 4 }[a] || 6;
    let k = rate * dt;
    while (k > 0) {
      if (Math.random() < k) {
        const p = { x: rand(-10, 12), y: rand(0.2, 5), z: rand(-6, 3), vx: 0, vy: 0, vz: 0, life: rand(2.5, 5), size: 0.08, scroll: true, fadeIn: true };
        let c = '#ffffff';
        if (a === 'snow') { p.y = 7; p.vy = -1.2; p.vx = -0.4; c = '#ffffff'; p.size = 0.09; }
        else if (a === 'ember') { p.y = 0; p.vy = rand(0.6, 1.6); c = '#ff7020'; p.size = 0.08; }
        else if (a === 'leaf') { p.y = 6; p.vy = -0.7; p.vx = -0.5; c = '#90c050'; p.size = 0.1; }
        else if (a === 'firefly') { p.vx = rand(-0.3, 0.3); p.vy = rand(-0.2, 0.2); c = '#d8ff70'; p.size = 0.12; }
        else if (a === 'wisp') { p.vx = rand(-0.2, 0.2); p.vy = 0.2; c = '#80a8ff'; p.size = 0.16; }
        else if (a === 'bubble') { p.y = 0.05; p.vy = 0.5; c = '#a0d0a0'; p.size = 0.07; }
        else if (a === 'sand') { p.vx = -3; p.x = 12; p.y = rand(0, 2.5); c = '#f0d8a0'; p.size = 0.05; }
        else if (a === 'star') { p.vy = 0.3; c = '#d090ff'; p.size = 0.1; }
        else { c = '#d0c8b8'; p.size = 0.05; p.vx = -0.2; }
        const cc = col(c); p.r = cc.r; p.gg = cc.g; p.b = cc.b;
        spawnP(p);
      }
      k -= 1;
    }
  }

  // ---------- efeitos ----------
  function later(d, fn) { st.timers.push({ at: now() + d, fn }); }
  function addFx(o) { st.fx.push(Object.assign({ t: 0 }, o)); scene.add(o.obj); }
  function fxMat(color, op = 1) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); }

  function slash(pos, color, big) {
    const m = new THREE.Mesh(G.torus(big ? 0.95 : 0.75, big ? 0.07 : 0.045, Math.PI * 1.1), fxMat(color, 0.95));
    m.position.copy(pos); m.rotation.set(0, -0.3, 1.0 + Math.random() * 0.6);
    addFx({ obj: m, life: 0.25, upd: (f, p) => { m.material.opacity = 1 - p; m.scale.setScalar(0.8 + p * 0.5); } });
    if (big) { const m2 = m.clone(); m2.material = fxMat(color, 0.8); m2.rotation.z += 1.6; addFx({ obj: m2, life: 0.3, upd: (f, p) => { m2.material.opacity = 0.8 * (1 - p); m2.scale.setScalar(0.7 + p * 0.6); } }); }
  }
  function ring(pos, color, size = 2.2, life = 0.5) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), fxMat(color, 0.9));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.05, pos.z);
    addFx({ obj: m, life, upd: (f, p) => { m.scale.setScalar(0.2 + ease(p) * size); m.material.opacity = 0.6 * (1 - p); }, dispose: true });
  }
  function pillar(x) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 9, 20, 1, true), fxMat('#ffe080', 0.6));
    m.position.set(x, 4.5, 0);
    addFx({ obj: m, life: 1.4, upd: (f, p) => { m.material.opacity = 0.55 * (1 - p); m.scale.set(1 + p * 0.5, 1, 1 + p * 0.5); if (Math.random() < 0.7) spawnP({ x: x + rand(-0.6, 0.6), y: 0, z: rand(-0.6, 0.6), vx: 0, vy: rand(3, 6), vz: 0, life: 0.9, r: 1, gg: 0.85, b: 0.4, size: 0.12 }); }, dispose: true });
  }
  function projectile(kind, from, to, color, big, dur, onHit) {
    const grp = group(null);
    if (kind === 'orb') {
      const core = mk(G.sph(big ? 0.2 : 0.13, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }), grp, 0, 0, 0, false);
      const gl = glowSprite(color, big ? 1.6 : 1.0, 1); grp.add(gl);
    } else {
      mk(G.cyl(kind === 'dart' ? 0.025 : 0.015, kind === 'dart' ? 0.025 : 0.015, kind === 'dart' ? 1 : 0.8, 4), new THREE.MeshBasicMaterial({ color: big ? color : '#8a6a40' }), grp, 0, 0, 0, false).rotation.z = Math.PI / 2;
      mk(G.cone(0.05, 0.14, 4), new THREE.MeshBasicMaterial({ color: '#e8ecf4' }), grp, 0.46, 0, 0, false).rotation.z = -Math.PI / 2;
      if (big) { const gl = glowSprite(color, 1.0, 0.9); grp.add(gl); }
    }
    grp.position.copy(from);
    const c = col(color);
    addFx({ obj: grp, life: dur, upd: (f, p) => {
      const arc = kind === 'orb' ? 0 : Math.sin(p * Math.PI) * 0.35;
      grp.position.set(lerp(from.x, to.x, p), lerp(from.y, to.y, p) + arc, lerp(from.z, to.z, p));
      const dy = (to.y - from.y) + Math.cos(p * Math.PI) * 0.35 * Math.PI * (kind === 'orb' ? 0 : 1);
      grp.rotation.z = Math.atan2(dy, to.x - from.x);
      if (kind === 'orb' || big) spawnP({ x: grp.position.x, y: grp.position.y, z: grp.position.z, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), life: 0.35, r: c.r, gg: c.g, b: c.b, size: big ? 0.25 : 0.16 });
    }, end: onHit, dispose: true });
  }

  function skillColor(name, wt) {
    if (/Gelo|Glacial/i.test(name)) return '#80d8ff';
    if (/Fogo|Meteoro|Fênix|Chamas/i.test(name)) return '#ff7a20';
    if (/Sagrad|Luz|Raio|Celest|Ira|Cruz|Julgamento|Esfera/i.test(name)) return '#ffe680';
    if (/Nova|Arcano|Elemental/i.test(name)) return '#c070ff';
    if (/Trovão|Choque|Sísmico/i.test(name)) return '#80e0ff';
    return { cajado: '#ff8a30', cetro: '#ffe680', arco: '#f0e0b0', dardo: '#e0e8f0' }[wt] || '#ffffff';
  }

  // ---------- números flutuantes (DOM) ----------
  const tmpV = new THREE.Vector3();
  function floatAt(pos, text, cls) {
    if (!layer) return;
    tmpV.copy(pos).project(camera);
    const x = (tmpV.x + 1) / 2 * W, y = (1 - tmpV.y) / 2 * H;
    const d = document.createElement('div');
    d.className = 'f3d fx-' + (cls || 'dmg');
    d.textContent = text;
    d.style.left = (x + rand(-18, 18)) + 'px'; d.style.top = y + 'px';
    layer.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  // ---------- posições ----------
  function heroBaseX() { return RANGED[CLASSES[S.cls].weapon] ? -2.0 : -1.3; }
  function monBaseX(boss) { return boss ? 2.2 : 1.8; }
  function monCenter() {
    const m = st.mon; if (!m) return null;
    const sc = m.boss ? 1.6 : 1;
    const y = (m.P.float ? m.P.float + 0.1 : 0.75) * sc * (m.kind === 'golem' ? 1.3 : 1);
    return new THREE.Vector3(m.root.position.x, y, 0);
  }
  function monTop() { const m = st.mon; if (!m) return null; const c = monCenter(); c.y += (m.boss ? 1.4 : 0.9); return c; }

  // ---------- eventos ----------
  function playerAttack(o) {
    if (!running || document.hidden || !st.hero) return;
    const t = now(), wt = CLASSES[S.cls].weapon, melee = !RANGED[wt];
    const dur = melee ? 0.45 : 0.55;
    st.hero.atk = { start: t, dur, skill: !!o.skill };
    const c0 = monCenter(); if (!c0) return;
    const color = skillColor(o.skill ? (o.skillName || '') : '', wt);
    const impact = () => {
      const m = st.mon; if (m) m.hurt = now();
      const c = monCenter() || c0;
      if (!o.miss) {
        burst(c, o.crit ? '#ffb040' : color, o.skill ? 30 : 14, o.skill ? 4.5 : 3);
        if (o.crit || o.skill) st.shake = Math.max(st.shake, o.skill ? 0.18 : 0.1);
      }
      floatAt(monTop() || c, o.text, o.cls);
    };
    if (melee) {
      later(dur * 0.5, () => {
        const c = monCenter() || c0;
        slash(new THREE.Vector3(c.x - 0.2, c.y, 0.3), o.skill ? color : '#ffffff', o.skill);
        if (o.skill) ring(c, color, 1.8, 0.4);
        impact();
      });
      return;
    }
    const name = o.skillName || '';
    const multi = o.skill && /Chuva|Tormenta|Tempestade|Triplo/i.test(name) ? (/Triplo/.test(name) ? 3 : 6) : 1;
    const sky = o.skill && /Meteoro|Chuva|Tormenta|Ira|Tempestade/i.test(name);
    const kind = wt === 'arco' ? 'arrow' : wt === 'dardo' ? 'dart' : 'orb';
    const hx = st.hero.root.position.x;
    for (let i = 0; i < multi; i++) {
      later(dur * 0.42 + i * 0.07, () => {
        const c = monCenter() || c0;
        const from = sky ? new THREE.Vector3(c.x + rand(-1, 2), 7, rand(-0.5, 0.5)) : new THREE.Vector3(hx + 0.5, wt === 'arco' ? 1.25 : 1.9, 0.25);
        const to = c.clone(); if (multi > 1) { to.x += rand(-0.4, 0.4); to.y += rand(-0.3, 0.3); }
        const last = i === multi - 1;
        projectile(kind, from, to, color, o.skill, sky ? 0.38 : 0.28, () => {
          if (last) { impact(); if (o.skill) ring(c, color, 1.8, 0.4); }
          else burst(to, color, 8, 2.5);
        });
      });
    }
  }

  function monsterAttack(o) {
    if (!running || document.hidden || !st.mon || !st.hero) return;
    st.mon.atk = now();
    later(0.2, () => {
      const h = st.hero; if (!h) return;
      const p = new THREE.Vector3(h.root.position.x, 1.1, 0.2);
      if (o.cls !== 'miss') { h.hurt = now(); burst(p, '#ff4040', 10, 2.5, 0.1); if (st.mon && st.mon.boss) st.shake = Math.max(st.shake, 0.12); }
      floatAt(new THREE.Vector3(h.root.position.x, 2.2, 0), o.text, o.cls);
    });
  }
  function float(target, text, cls) {
    if (!running || document.hidden) return;
    if (target === 'player' && st.hero) floatAt(new THREE.Vector3(st.hero.root.position.x, 2.2, 0), text, cls);
    else { const p = monTop(); if (p) floatAt(p, text, cls); }
  }
  function heal() {
    if (!running || document.hidden || !st.hero) return;
    const x = st.hero.root.position.x;
    for (let i = 0; i < 24; i++) spawnP({ x: x + rand(-0.5, 0.5), y: rand(0, 1.6), z: rand(-0.5, 0.5), vx: 0, vy: rand(1, 2), vz: 0, life: 1, r: 0.4, gg: 1, b: 0.5, size: 0.16 });
    ring(st.hero.root.position, '#70f080', 1.6, 0.6);
  }
  function buff() {
    if (!running || document.hidden || !st.hero) return;
    const x = st.hero.root.position.x;
    ring(st.hero.root.position, '#ffd860', 2, 0.6);
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28; spawnP({ x: x + Math.cos(a) * 0.7, y: 0.1, z: Math.sin(a) * 0.7, vx: 0, vy: rand(2, 4), vz: 0, life: 0.8, r: 1, gg: 0.85, b: 0.4, size: 0.12 }); }
  }
  function levelUp() {
    if (!running || document.hidden || !st.hero) return;
    pillar(st.hero.root.position.x);
    floatAt(new THREE.Vector3(st.hero.root.position.x, 2.8, 0), 'LEVEL UP!', 'lvl');
  }

  // ---------- sincronização ----------
  function disposeObj(o) { o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
  function sync(t) {
    if (curZone !== S.zone) { curZone = S.zone; buildEnv(S.zone); }
    if (curCls !== S.cls) {
      if (st.hero) { scene.remove(st.hero.root); disposeObj(st.hero.root); }
      curCls = S.cls; weaponKey = '';
      st.hero = buildHero(S.cls); scene.add(st.hero.root);
      st.hero.root.position.x = heroBaseX();
    }
    updateWeaponLook();
    const m = R.mon;
    if (m && (!st.mon || st.mon.sid !== m.sid)) {
      if (st.mon && !st.mon.dieAt) { st.mon.dieAt = t; st.dying.push(st.mon); }
      const mon = buildMonster(m.name, m.boss);
      mon.sid = m.sid; mon.root.position.set(9, 0, 0);
      scene.add(mon.root); st.mon = mon;
      if (m.boss) { st.shake = Math.max(st.shake, 0.15); ring(new THREE.Vector3(monBaseX(true), 0, 0), '#b060ff', 4, 0.9); }
    }
    if (!m && st.mon) {
      const pending = st.timers.length ? Math.max(...st.timers.map((x) => x.at)) - t + 0.3 : 0;
      const hasProj = st.fx.some((f) => f.end && !f.ended);
      const dm = st.mon;
      dm.dieAt = t + Math.max(0, pending) + (hasProj ? 0.3 : 0.05);
      later(Math.max(0, dm.dieAt - t), () => {
        const c = new THREE.Vector3(dm.root.position.x, 0.8 * (dm.boss ? 1.6 : 1), 0);
        burst(c, dm.color, dm.boss ? 70 : 26, dm.boss ? 6 : 4, 0.16, 2);
        burst(c, '#ffffff', dm.boss ? 20 : 8, 3, 0.1, 2);
        if (dm.boss) { st.shake = 0.3; ring(c, '#ffd060', 5, 0.9); }
      });
      st.dying.push(dm); st.mon = null;
    }
    const busy = st.dying.some((d) => t < d.dieAt + 0.35);
    st.run = !st.mon && !(R.dead > 0) && !busy;
  }

  // ---------- animação do herói ----------
  function animHero(t, dt) {
    const h = st.hero, wt = h.wt, melee = !RANGED[wt];
    const a = h.atk ? clamp((t - h.atk.start) / h.atk.dur, 0, 1) : 1;
    if (h.atk && a >= 1) h.atk = null;
    let x = heroBaseX();
    if (h.atk && melee) {
      const lunge = Math.max(0, monBaseX(st.mon && st.mon.boss) - x - (wt === 'lanca' ? 1.7 : 1.15) - (st.mon && st.mon.boss ? 0.4 : 0));
      x += Math.sin(clamp((a - 0.12) / 0.7, 0, 1) * Math.PI) * lunge;
    }
    if (t - h.hurt < 0.15) x -= 0.08;
    h.root.position.x = lerp(h.root.position.x, x, Math.min(1, dt * 25));
    const dead = R.dead > 0;
    h.inner.rotation.z = lerp(h.inner.rotation.z, dead ? Math.PI / 2 : 0, Math.min(1, dt * 6));
    h.inner.position.y = lerp(h.inner.position.y, dead ? 0.25 : 0, Math.min(1, dt * 6));
    h.inner.position.x = lerp(h.inner.position.x, dead ? -0.7 : 0, Math.min(1, dt * 6));
    const run = st.run;
    const ph = t * 11;
    h.hips.position.y = 0.72 + (run ? Math.abs(Math.sin(ph)) * 0.07 : Math.sin(t * 2.5) * 0.012);
    h.torso.rotation.z = run ? -0.15 : (h.atk && melee ? -Math.sin(a * Math.PI) * 0.25 : 0);
    const legA = run ? Math.sin(ph) * 0.8 : 0;
    h.legs[0].rotation.z = legA; h.legs[1].rotation.z = -legA;
    // braço de trás
    let back = run ? -Math.sin(ph) * 0.7 : 0.1 + Math.sin(t * 2.5) * 0.04;
    if (wt === 'espada') back = 0.9;
    // braço da frente
    const rest = run ? 0.3 + Math.sin(ph) * 0.6 : 0.35 + Math.sin(t * 2.5) * 0.04;
    let fa = rest, glow = 0, showW = true, pull = 0;
    if (wt === 'arco') {
      fa = run ? 0.6 : 1.57;
      back = run ? back : 1.35;
      if (h.atk) { pull = a < 0.45 ? ease(a / 0.45) : 0; back = 1.35 + pull * 0.25; }
    } else if (wt === 'lanca') {
      fa = run ? 1.0 : 1.3; if (h.atk) fa = 1.57;
    } else if (h.atk) {
      if (melee) { fa = a < 0.4 ? lerp(rest, 2.9, ease(a / 0.4)) : a < 0.6 ? lerp(2.9, 0.4, (a - 0.4) / 0.2) : lerp(0.4, rest, (a - 0.6) / 0.4); glow = h.atk.skill ? 1 : 0; }
      else if (wt === 'dardo') { fa = a < 0.35 ? lerp(rest, 3.6, ease(a / 0.35)) : a < 0.5 ? lerp(3.6, 1.3, (a - 0.35) / 0.15) : lerp(1.3, rest, (a - 0.5) / 0.5); showW = !(a > 0.45 && a < 0.92); }
      else { fa = a < 0.35 ? lerp(rest, 2.6, ease(a / 0.35)) : a < 0.7 ? 2.6 : lerp(2.6, rest, (a - 0.7) / 0.3); glow = 1; }
    }
    h.arms[0].rotation.z = lerp(h.arms[0].rotation.z, back, Math.min(1, dt * 20));
    h.arms[1].rotation.z = h.atk ? fa : lerp(h.arms[1].rotation.z, fa, Math.min(1, dt * 15));
    h.weapon.visible = showW;
    if (wt === 'arco') {
      const u = h.weapon.userData;
      u.arrow.visible = !!h.atk && a < 0.45;
      u.arrow.position.y = u.stringY + pull * 0.25; u.string.position.y = u.stringY + pull * 0.25;
    }
    if (h.weapon.userData.glow) { h.weapon.userData.glow.material.opacity = 0.5 + glow * 0.5 + Math.sin(t * 4) * 0.1; h.weapon.userData.glow.scale.setScalar(0.7 + glow * 0.6); }
    // dano
    setFlash(h.mats, t - h.hurt < 0.15 ? 0.9 : 0, '#ff6060');
    if (!(t - h.hurt < 0.15)) updateWeaponLook();
    // aura de buff
    const buffOn = R.buffs && R.buffs.length > 0;
    h.aura.material.opacity = lerp(h.aura.material.opacity, buffOn ? 0.55 + Math.sin(t * 4) * 0.15 : 0, Math.min(1, dt * 6));
    h.aura.rotation.z += dt; h.auraGlow.material.opacity = h.aura.material.opacity * 0.35;
  }

  // ---------- loop ----------
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden || !S) return;
    const t = now(), dt = Math.min(0.05, t - (lastT || t)); lastT = t;
    sync(t);
    const due = st.timers.filter((x) => x.at <= t); st.timers = st.timers.filter((x) => x.at > t);
    for (const d of due) d.fn();
    if (st.run) scrollEnv(RUN_SPEED * dt);
    animHero(t, dt);
    if (st.mon) {
      const m = st.mon, target = monBaseX(m.boss);
      if (m.root.position.x > target) m.root.position.x = Math.max(target, m.root.position.x - 9 * dt);
      let x = m.root.position.x;
      animMonster(m, t, dt);
      const atkA = m.atk ? clamp((t - m.atk) / 0.4, 0, 1) : 0;
      if (m.atk && atkA >= 1) m.atk = 0;
      m.inner.position.x = -Math.sin(atkA * Math.PI) * 0.7 + (t - m.hurt < 0.15 ? 0.1 : 0);
      setFlash(m.mats, t - m.hurt < 0.12 ? 1.2 : 0);
    }
    for (const d of st.dying) {
      animMonster(d, t, dt);
      if (st.run) d.root.position.x -= RUN_SPEED * dt;
      if (t > d.dieAt) {
        const p = clamp((t - d.dieAt) / 0.7, 0, 1);
        if (!d.faded) { d.faded = true; setOpacity(d.mats, 1); }
        d.inner.rotation.z = -ease(p) * 1.4; d.inner.position.y = -p * 0.3;
        setOpacity(d.mats, 1 - p); setFlash(d.mats, p < 0.15 ? 1.5 : 0);
        d.root.scale.setScalar((d.boss ? 1.6 : 1) * (1 - p * 0.3));
      }
    }
    st.dying = st.dying.filter((d) => { const keep = t < d.dieAt + 0.8; if (!keep) { scene.remove(d.root); disposeObj(d.root); } return keep; });
    // efeitos
    for (const f of st.fx) {
      f.t += dt; const p = clamp(f.t / f.life, 0, 1);
      f.upd && f.upd(f, p);
      if (p >= 1 && f.end && !f.ended) { f.ended = true; f.end(); }
    }
    st.fx = st.fx.filter((f) => { const keep = f.t < f.life; if (!keep) { scene.remove(f.obj); if (f.dispose) disposeObj(f.obj); } return keep; });
    ambient(dt);
    updateParticles(dt);
    if (env.stars) env.stars.material.opacity = 0.7 + Math.sin(t * 2) * 0.2;
    // câmera
    const aspect = W / H;
    const back = clamp(1.45 / aspect, 1, 1.9);
    const sk = st.shake; st.shake = Math.max(0, st.shake - dt * 0.8);
    camera.position.set(0.2 + Math.sin(t * 0.25) * 0.25 + (Math.random() - 0.5) * sk, 2.5 + (Math.random() - 0.5) * sk, 7.6 * back);
    camera.lookAt(0.2, 1.05, 0);
    renderer.render(scene, camera);
  }

  function resize() {
    if (!cv || !renderer) return;
    const r = cv.getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(160, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    if (pts) pts.material.uniforms.uScale.value = (H * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
  }

  const ro = window.ResizeObserver ? new ResizeObserver(() => resize()) : null;
  function start(canvas) {
    cv = canvas; layer = document.getElementById('floats3d');
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(38, 2, 0.1, 120);
      GLOW = glowTex();
      initParticles();
    }
    // reinicia o estado visual
    if (st.hero) { scene.remove(st.hero.root); disposeObj(st.hero.root); }
    if (st.mon) { scene.remove(st.mon.root); disposeObj(st.mon.root); }
    for (const d of st.dying) { scene.remove(d.root); disposeObj(d.root); }
    for (const f of st.fx) scene.remove(f.obj);
    st.hero = null; st.mon = null; st.dying = []; st.fx = []; st.timers = []; parts.length = 0;
    curZone = null; curCls = null;
    if (ro) { ro.disconnect(); ro.observe(cv); }
    resize();
    if (!running) { running = true; lastT = 0; raf = requestAnimationFrame(frame); }
  }
  function stop() { running = false; cancelAnimationFrame(raf); if (layer) layer.innerHTML = ''; }

  return { ok: true, start, stop, resize, playerAttack, monsterAttack, float, heal, buff, levelUp };
})();

// ---------- fachada: escolhe 3D ou 2D ----------
const Scene = (() => {
  let impl = null;
  const pick = () => ((typeof S !== 'undefined' && S && S.settings && S.settings.gfx === '2d') || !Scene3D.ok ? Scene2D : Scene3D);
  const fwd = (k) => (...a) => impl && impl[k](...a);
  return {
    start() {
      const next = pick();
      if (impl && impl !== next) impl.stop();
      impl = next;
      const c2 = document.getElementById('scene'), c3 = document.getElementById('scene3d');
      c2.style.display = impl === Scene2D ? 'block' : 'none';
      c3.style.display = impl === Scene3D ? 'block' : 'none';
      impl.start(impl === Scene2D ? c2 : c3);
    },
    stop() { Scene2D.stop(); Scene3D.stop(); },
    resize: fwd('resize'), playerAttack: fwd('playerAttack'), monsterAttack: fwd('monsterAttack'),
    float: fwd('float'), heal: fwd('heal'), buff: fwd('buff'), levelUp: fwd('levelUp'),
    is3D: () => impl === Scene3D,
  };
})();
