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
  const st = { hero: null, mon: null, ents: new Map(), pet: null, dying: [], fx: [], timers: [], shake: 0, run: false };
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
    if (wt === 'foice' || wt === 'lanca') return buildWeaponT('foice', null, M);
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

  // ---------- herói / personagens ----------
  const TIER_COL = ['#7a5a3a', '#8a9098', '#c4cad4', '#3a5aa0', '#a02a2a', '#f0e2b0'];
  const tierOf = (it) => clamp(Math.floor((it.ilvl || 1) / 17), 0, 5);
  const rarOf = (it) => RARITIES.find((r) => r.id === it.rarity) || RARITIES[0];
  const rarIdx = (it) => RARITIES.indexOf(rarOf(it));
  const mixCol = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getStyle();
  const ONE_HAND = { machado: 1, martelo: 1, espada: 1, dardo: 1, cetro: 1 };

  function buildHelmet(head, it, M) {
    const tier = tierOf(it), tc = TIER_COL[tier], rc = rarIdx(it) > 0 ? rarOf(it).color : '#d0b060';
    const metal = M(tc, { m: 0.2, r: tier ? 0.4 : 0.8 }), trim = M(rc, { e: rarIdx(it) > 1 ? rc : '#000000', ei: 0.4 });
    const dome = mk(G.sph(0.34, 14), metal, head, 0, 0.32, 0);
    dome.scale.set(1, tier === 0 ? 0.6 : 0.85, 1);
    mk(G.cyl(0.345, 0.345, 0.06, 16), trim, head, 0, tier === 0 ? 0.36 : 0.3, 0);
    if (tier >= 1) mk(G.box(0.06, 0.2, 0.05), metal, head, 0.31, 0.24, 0);
    if (tier >= 2) { mk(G.box(0.05, 0.04, 0.3), M('#111111'), head, 0.33, 0.32, 0); mk(G.box(0.4, 0.08, 0.05), trim, head, -0.02, 0.66, 0); }
    if (tier === 3) for (const z of [-1, 1]) { const h = mk(G.cone(0.06, 0.32, 6), M('#e8e0c8'), head, 0, 0.5, 0.28 * z); h.rotation.x = 0.9 * z; }
    if (tier === 4) { for (let i = 0; i < 4; i++) mk(G.cone(0.05, 0.22 - i * 0.03, 4), trim, head, 0.12 - i * 0.12, 0.66, 0); for (const z of [-1, 1]) { const h = mk(G.cone(0.05, 0.4, 6), M('#2a1010'), head, -0.2, 0.45, 0.22 * z); h.rotation.z = 1.2; } }
    if (tier === 5) {
      mk(G.torus(0.24, 0.02), M('#fff0a0', { e: '#ffd860', ei: 0.8 }), head, 0, 0.82, 0).rotation.x = Math.PI / 2;
      for (const z of [-1, 1]) { const w = mk(G.box(0.34, 0.18, 0.02), M('#ffffff', { e: '#ffffff', ei: 0.3 }), head, -0.1, 0.5, 0.32 * z); w.rotation.z = 0.6; }
    }
  }

  function buildShield(hand, it, M) {
    const sh = group(hand, 0.12, 0, 0);
    const tier = it ? tierOf(it) : 2, tc = it ? TIER_COL[tier] : '#c8ccd8', rc = it && rarIdx(it) > 0 ? rarOf(it).color : '#e0b040';
    const face = M(tier === 0 ? '#8a6038' : tc, { m: 0.2, r: tier === 0 ? 0.9 : 0.4 }), emb = M(rc, { e: it && rarIdx(it) > 1 ? rc : '#000000', ei: 0.5 });
    if (tier === 0) { const c = mk(G.cyl(0.3, 0.3, 0.06, 14), face, sh, 0, 0, 0); c.rotation.z = Math.PI / 2; mk(G.sph(0.07, 8), emb, sh, 0.04, 0, 0); }
    else if (tier <= 2) { mk(G.box(0.06, 0.55, 0.42), face, sh, 0, 0, 0); mk(G.box(0.07, 0.42, 0.07), emb, sh, 0.01, 0, 0); mk(G.box(0.07, 0.07, 0.3), emb, sh, 0.01, 0.07, 0); }
    else { mk(G.box(0.07, 0.8, 0.5), face, sh, 0, -0.05, 0); mk(G.box(0.08, 0.6, 0.06), emb, sh, 0.01, -0.05, 0); mk(G.oct(0.1), M(rc, { e: rc, ei: 1 }), sh, 0.06, 0.12, 0); }
    return sh;
  }

  // L = aparência, wt = tipo de arma (ou null), eq = equipamentos
  function buildCharacter(L, wt, eq = {}) {
    const mats = [];
    const M = matFactory(mats);
    const root = group(null);
    const inner = group(root);
    inner.rotation.y = -0.45;
    const hips = group(inner, 0, 0.72, 0);
    const arm = eq.armadura, boot = eq.botas, glove = eq.luvas;
    const aT = arm ? tierOf(arm) : -1;
    const bodyCol = arm ? (L.robe ? mixCol(L.body, TIER_COL[aT], 0.4) : TIER_COL[aT]) : L.body;
    const trimCol = arm && rarIdx(arm) > 0 ? rarOf(arm).color : L.trim;
    const pants = M(arm && !L.robe ? mixCol(L.pants, TIER_COL[aT], 0.35) : L.pants);
    const boots = M(boot ? TIER_COL[tierOf(boot)] : new THREE.Color(L.pants).multiplyScalar(0.55).getStyle(), { m: boot ? 0.2 : 0 });
    const legs = [];
    for (const z of [-0.12, 0.12]) {
      const lg = group(hips, 0, 0, z);
      mk(G.box(0.17, 0.62, 0.18), pants, lg, 0, -0.31, 0);
      mk(G.box(0.24, 0.12 + (boot ? 0.06 : 0), 0.22), boots, lg, 0.04, -0.64, 0);
      if (boot && tierOf(boot) >= 3) mk(G.box(0.2, 0.12, 0.2), M(rarOf(boot).color), lg, 0.03, -0.36, 0);
      legs.push(lg);
    }
    const torso = group(hips, 0, 0, 0);
    const bodyM = M(bodyCol, { m: arm && !L.robe ? 0.2 : 0, r: arm && aT > 0 && !L.robe ? 0.4 : 0.6 }), trimM = M(trimCol, { m: 0.2, r: 0.35, e: arm && rarIdx(arm) > 2 ? trimCol : '#000000', ei: 0.35 });
    mk(G.box(0.46, 0.56, 0.34), bodyM, torso, 0, 0.3, 0);
    mk(G.box(0.48, 0.08, 0.36), trimM, torso, 0, 0.06, 0);
    if (arm && aT >= 2 && !L.robe) mk(G.box(0.1, 0.4, 0.3), trimM, torso, 0.2, 0.32, 0);
    if (L.robe) {
      mk(G.cyl(0.25, 0.44, 0.78, 12), bodyM, torso, 0, -0.33, 0);
      mk(G.cyl(0.445, 0.445, 0.06, 12), trimM, torso, 0, -0.69, 0);
      mk(G.box(0.05, 0.8, 0.02), trimM, torso, 0.27, -0.1, 0).rotation.z = -0.15;
    }
    const pS = 1 + Math.max(0, aT) * 0.12;
    for (const z of [-0.27, 0.27]) {
      const p = mk(G.sph(0.13, 8), trimM, torso, 0, 0.55, z); p.scale.setScalar(pS);
      if (aT >= 4) mk(G.cone(0.05, 0.22, 5), M(aT === 5 ? '#fff0b0' : '#2a1414'), torso, 0, 0.72, z * 1.05);
    }
    let cape = null;
    if (arm && aT >= 3) {
      cape = group(torso, -0.2, 0.55, 0);
      mk(G.box(0.03, 0.95, 0.44), M(new THREE.Color(rarIdx(arm) > 0 ? rarOf(arm).color : '#5a2020').multiplyScalar(0.7).getStyle(), { flat: false }), cape, 0, -0.47, 0);
    }
    if (arm && rarIdx(arm) >= 2) mk(G.oct(0.06), M(rarOf(arm).color, { e: rarOf(arm).color, ei: 1.2 }), torso, 0.24, 0.36, 0);
    if (eq.amuleto) {
      const ac = rarOf(eq.amuleto).color;
      mk(G.oct(0.05), M(ac, { e: ac, ei: 1.4 }), torso, 0.25, 0.47, 0.08);
      const gl = glowSprite(ac, 0.35, 0.8); gl.position.set(0.26, 0.47, 0.08); torso.add(gl);
    }
    const armM = L.bare ? M(L.skin, { flat: false }) : M(new THREE.Color(bodyCol).multiplyScalar(0.85).getStyle(), { m: 0.1 });
    const skinM = M(L.skin, { flat: false });
    const gloveM = glove ? M(TIER_COL[tierOf(glove)], { m: 0.2, r: 0.45 }) : null;
    const arms = [];
    for (const z of [-0.3, 0.3]) {
      const a = group(torso, 0, 0.5, z);
      mk(G.box(0.14, 0.5, 0.14), armM, a, 0, -0.25, 0);
      if (glove) { mk(G.box(0.17, 0.2, 0.17), gloveM, a, 0, -0.44, 0); mk(G.box(0.15, 0.04, 0.15), M(rarOf(glove).color), a, 0, -0.33, 0); }
      mk(G.sph(0.085, 8), glove ? gloveM : skinM, a, 0, -0.52, 0);
      const hand = group(a, 0, -0.52, 0);
      a.userData.hand = hand;
      arms.push(a);
    }
    const head = group(torso, 0, 0.6, 0);
    if (eq.elmo) {
      const skin = M(L.skin, { flat: false });
      mk(G.sph(0.3, 16), skin, head, 0, 0.28, 0);
      const eye = M('#1a1010');
      mk(G.sph(0.04, 6), eye, head, 0.27, 0.3, 0.1); mk(G.sph(0.04, 6), eye, head, 0.27, 0.3, -0.1);
      buildHelmet(head, eq.elmo, M);
    } else buildHead(head, L, M);
    let weapon = group(null);
    if (wt && eq.arma) weapon = buildWeaponT(eq.arma.wtype || wt, eq.arma, M);
    else if (wt) {
      weapon = buildWeapon(wt, L, M);
      if (eq.arma) {
        const tier = tierOf(eq.arma), rc = rarOf(eq.arma).color;
        weapon.scale.setScalar(1 + tier * 0.07);
        if (tier >= 3 && wt !== 'arco') for (const y of [-0.25, -0.45]) mk(G.sph(0.04, 6), M(rc, { e: rc, ei: 1.5 }), weapon, 0.04, y, 0);
        if (tier >= 5) { const gl = glowSprite(rc, 0.9, 0.6); gl.position.set(0, wt === 'lanca' ? -1.5 : -0.9, 0); weapon.add(gl); }
      }
    }
    arms[1].userData.hand.add(weapon);
    if (ONE_HAND[wt] && (eq.escudo || wt === 'espada')) buildShield(arms[0].userData.hand, eq.escudo, M);
    // aura de buff
    const aura = mk(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: '#ffd860', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), root, 0, 0.03, 0, false);
    aura.rotation.x = -Math.PI / 2;
    const auraGlow = glowSprite('#ffd860', 2.4, 0); auraGlow.position.set(0, 1, 0); root.add(auraGlow);
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    aura.castShadow = false;
    return { root, inner, hips, legs, torso, arms, head, weapon, mats, wt, aura, auraGlow, cape, atk: null, hurt: -9, x: 0 };
  }
  function buildHero(cls) {
    if (modelsReady()) { const h = buildHeroModel(cls); if (h) return h; }
    const eq = {};
    for (const k of ['arma', 'armadura', 'elmo', 'luvas', 'botas', 'escudo', 'amuleto']) if (S.equip[k] && (k !== 'arma' || S.equip[k].wtype === CLASSES[cls].weapon)) eq[k] = S.equip[k];
    return buildCharacter(LOOK[cls], CLASSES[cls].weapon, eq);
  }
  const equipSig = () => S.cls + '|' + ['arma', 'armadura', 'elmo', 'luvas', 'botas', 'escudo', 'amuleto', 'anel'].map((k) => S.equip[k] ? S.equip[k].uid + ':' + S.equip[k].refine : '-').join(',');

  function updateWeaponLook() {
    const h = st.hero; if (!h || !S.equip.arma || h.model || !h.weapon.userData.glowMats) return;
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
    if (modelsReady() && MON_MODEL[name]) { const m = buildMonsterModel(name, boss); if (m) return m; }
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
    if (m.model) return animMonsterModel(m, t, dt);
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
    disposeEnv();
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

  // ---------- equipamentos por tier (6 visuais por tipo) ----------
  const METAL = ['#a06a38', '#a2aab4', '#e2e7ef', '#5a82e6', '#c4303c', '#fff0c4'];
  const GRIP = ['#6a4a2a', '#4a3a2a', '#3a2c26', '#26283e', '#2a0e0e', '#f0e6d0'];
  function gearMats(M, tier, rc, ri, refine) {
    const lit = ri >= 2 || tier >= 3;
    const amt = (ri > 0 ? 0.25 + ri * 0.15 : 0) + (refine || 0) * 0.07 + (tier >= 3 ? 0.3 : 0);
    return {
      metal: M(METAL[tier], { r: 0.3, m: 0.2, e: tier >= 5 ? '#ffe8a0' : '#000000', ei: tier >= 5 ? 0.25 : 0 }),
      grip: M(GRIP[tier], { r: 0.8 }),
      gold: M(tier >= 4 ? '#ffd040' : '#c8a040', { r: 0.35, m: 0.2 }),
      glow: M(rc, { e: rc, ei: Math.max(0.7, amt * 1.5), r: 0.2 }),
      edge: M(lit ? rc : METAL[tier], { e: lit ? rc : '#000000', ei: lit ? Math.max(0.5, amt) : 0, r: 0.25 }),
      white: M('#ffffff', { e: '#fff6d8', ei: 0.4 }),
    };
  }
  const tubeG = (pts, r, seg = 20) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))), seg, r, 6, false);
  function extrudeG(shape, depth) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: depth * 0.5, bevelSegments: 1, curveSegments: 14 });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  function crescent(L, curl, w = 0.08) {
    const s = new THREE.Shape();
    s.moveTo(0, w); s.quadraticCurveTo(L * 0.55, w + 0.12, L, -curl);
    s.quadraticCurveTo(L * 0.5, -0.02, 0, -w); s.lineTo(0, w);
    return s;
  }

  // FOICE — lâmina curva que cresce, ganha lâmina traseira, runas, espinhos e asas
  function wScythe(t, k, M, rc) {
    const g = group(null), len = 1.75 + t * 0.07, end = 0.45 - len;
    mk(G.cyl(0.03, 0.036, len, 8), k.grip, g, 0, 0.45 - len / 2, 0);
    for (let i = 0; i < 2 + Math.min(t, 3); i++) mk(G.cyl(0.042, 0.042, 0.045, 8), t >= 1 ? k.metal : k.grip, g, 0, 0.32 - i * 0.34, 0);
    mk(t >= 3 ? G.oct(0.07) : G.sph(0.05, 8), t >= 3 ? k.glow : k.metal, g, 0, 0.5, 0);
    const head = group(g, 0, end, 0);
    mk(G.box(0.13, 0.17, 0.08), k.metal, head, 0.02, 0, 0);
    const L = 0.62 + t * 0.11, curl = L * 0.38;
    mk(extrudeG(crescent(L, curl), 0.022), k.metal, head, 0.05, 0.02, 0);
    if (t >= 1) mk(tubeG([[0.05, -0.06, 0], [0.05 + L * 0.5, -0.0, 0], [0.05 + L, -curl + 0.02, 0]], 0.011 + t * 0.002, 16), k.edge, head, 0, 0, 0);
    if (t >= 2) {
      const L2 = L * (t >= 5 ? 0.85 : 0.48);
      const b2 = mk(extrudeG(crescent(L2, L2 * 0.38, 0.06), 0.018), k.metal, head, -0.05, 0.02, 0); b2.scale.x = -1;
      if (t >= 3) mk(tubeG([[-0.05, -0.05, 0], [-0.05 - L2 * 0.5, 0, 0], [-0.05 - L2, -L2 * 0.38 + 0.02, 0]], 0.01, 12), k.edge, head, 0, 0, 0);
    }
    if (t >= 3) { mk(G.oct(0.065), k.glow, head, 0.02, 0, 0.06); for (let i = 0; i < 3; i++) mk(G.sph(0.022, 6), k.glow, g, 0.036, -0.18 - i * 0.32, 0); }
    if (t >= 4) {
      for (let i = 0; i < 4; i++) { const c = mk(G.cone(0.026, 0.13, 4), k.gold, head, 0.16 + i * L * 0.2, 0.13 + Math.sin((i / 3) * Math.PI) * 0.06, 0); c.rotation.z = -0.35; }
      for (const s of [-1, 1]) { const h = mk(G.cone(0.032, 0.22, 5), k.gold, head, 0, -0.1, 0.05 * s); h.rotation.x = s * 2.6; }
    }
    if (t >= 5) {
      mk(G.torus(0.17, 0.013), k.glow, head, 0.02, 0.05, 0);
      for (const s of [-1, 1]) { const w = mk(G.box(0.26, 0.09, 0.012), k.white, g, 0.13 * s, 0.4, 0); w.rotation.z = 0.5 * s; }
      const gl = glowSprite(rc, 0.7, 0.35); gl.position.set(0.32, 0, 0); head.add(gl);
    }
    return g;
  }

  // ARCO — de madeira simples a recurvo rúnico, asa de dragão e celestial com asas
  function wBow(t, k, M, rc) {
    const g = group(null), H = 0.55 + t * 0.035, bul = 0.12 + (t >= 2 ? 0.03 : 0), rec = t >= 2 ? 0.06 + t * 0.012 : 0;
    const tipZ = rec ? -rec : 0, r = 0.022 + t * 0.003;
    const pts = (s) => [[0, 0, 0], [0, s * H * 0.35, bul * 0.9], [0, s * H * 0.75, bul * 0.6], [0, s * H, rec ? -rec * 0.3 : bul * 0.15], [0, s * (H + 0.05), tipZ]];
    for (const s of [1, -1]) {
      mk(tubeG(pts(s), r, 24), t >= 3 ? k.metal : k.grip, g, 0, 0, 0);
      if (t >= 1) mk(G.sph(0.03 + t * 0.004, 8), t >= 3 ? k.glow : k.metal, g, 0, s * (H + 0.05), tipZ);
      if (t >= 2) mk(tubeG(pts(s).slice(0, 3).map((p) => [p[0], p[1], p[2] + 0.025]), 0.008, 10), k.edge, g, 0, 0, 0);
      if (t >= 3) for (let i = 0; i < 2; i++) mk(G.sph(0.02, 6), k.glow, g, 0, s * (0.2 + i * 0.2), bul * 0.85 + 0.02);
      if (t >= 4) {
        const sp = mk(G.cone(0.026, 0.17, 4), k.gold, g, 0, s * (H + 0.13), tipZ); if (s < 0) sp.rotation.x = Math.PI;
        for (let i = 0; i < 3; i++) { const fin = mk(G.box(0.012, 0.13, 0.12), k.edge, g, 0, s * (0.16 + i * 0.15) * H / 0.6, bul * 0.9 + 0.07); fin.rotation.x = s * 0.45; }
      }
    }
    mk(G.cyl(0.036, 0.036, 0.17, 8), M(t >= 4 ? '#1a1010' : '#5a3a22'), g, 0, 0, 0.02);
    if (t >= 2) mk(G.oct(0.05), k.glow, g, 0, 0, 0.07);
    mk(G.cyl(0.0045, 0.0045, (H + 0.05) * 2, 3), t >= 3 ? k.glow : M('#f2f2f2'), g, 0, 0, tipZ, false);
    if (t >= 5) {
      mk(G.torus(0.12, 0.011), k.glow, g, 0, 0, 0.06).rotation.y = Math.PI / 2;
      for (const s of [1, -1]) { const w = mk(G.box(0.012, 0.11, 0.34), k.white, g, 0, s * 0.13, 0.22); w.rotation.x = -0.6 * s; }
      g.add(glowSprite(rc, 0.7, 0.3));
    }
    return g;
  }

  function wSword(t, k, M, rc) {
    const g = group(null);
    mk(G.cyl(0.03, 0.03, 0.2, 6), k.grip, g, 0, 0.02, 0);
    mk(t >= 3 ? G.oct(0.05) : G.sph(0.04, 6), t >= 3 ? k.glow : k.metal, g, 0, 0.14, 0);
    const gw = 0.24 + t * 0.045;
    mk(G.box(0.07, 0.05, gw), k.gold, g, 0, -0.1, 0);
    if (t >= 2) for (const s of [-1, 1]) { const q = mk(G.cone(0.03, 0.12, 4), k.gold, g, 0, -0.07, s * gw / 2); q.rotation.x = s * -1.2; }
    if (t >= 4) for (const s of [-1, 1]) { const w = mk(G.box(0.03, 0.2, 0.13), k.edge, g, 0, -0.03, s * (gw / 2 + 0.06)); w.rotation.x = s * 0.5; }
    const L = 0.8 + t * 0.08, W = 0.08 + t * 0.012;
    const sh = new THREE.Shape(); sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2 * 0.8, L * 0.85); sh.lineTo(0, L); sh.lineTo(-W / 2 * 0.8, L * 0.85); sh.lineTo(-W / 2, 0);
    const bg = extrudeG(sh, 0.014); bg.rotateZ(Math.PI);
    const bl = mk(bg, k.metal, g, 0, -0.12, 0); bl.rotation.y = Math.PI / 2;
    if (t >= 1) mk(G.box(0.022, L * 0.7, W * 0.25), k.edge, g, 0, -0.12 - L * 0.4, 0);
    if (t >= 3) mk(G.oct(0.04), k.glow, g, 0.02, -0.1, 0);
    if (t >= 5) { const gl = glowSprite(rc, 0.6, 0.3); gl.position.y = -0.5; g.add(gl); }
    return g;
  }

  function wAxe(t, k, M, rc) {
    const g = group(null), len = 0.85 + t * 0.06;
    mk(G.cyl(0.033, 0.036, len + 0.15, 7), k.grip, g, 0, 0.12 - (len + 0.15) / 2, 0);
    const hy = -len + 0.18, s0 = t * 0.035;
    const sh = new THREE.Shape();
    sh.moveTo(0.02, 0.09); sh.lineTo(0.17 + s0, 0.2 + s0); sh.quadraticCurveTo(0.3 + s0 * 1.4, 0, 0.17 + s0, -0.2 - s0); sh.lineTo(0.02, -0.09); sh.lineTo(0.02, 0.09);
    const head = group(g, 0, hy, 0);
    mk(G.box(0.1, 0.2, 0.08), k.metal, head, 0, 0, 0);
    mk(extrudeG(sh, 0.035), k.metal, head, 0.02, 0, 0);
    if (t >= 1) mk(tubeG([[0.19 + s0, 0.2 + s0, 0], [0.3 + s0 * 1.3, 0, 0], [0.19 + s0, -0.2 - s0, 0]], 0.012, 12), k.edge, head, 0, 0, 0);
    if (t >= 2) { const b = mk(extrudeG(sh, 0.03), k.metal, head, -0.02, 0, 0); b.scale.set(-0.8, 0.8, 1); }
    if (t >= 3) mk(G.oct(0.05), k.glow, head, 0, 0, 0.055);
    if (t >= 4) { const c = mk(G.cone(0.03, 0.2, 5), k.gold, head, 0, 0.18, 0); for (let i = 0; i < 3; i++) mk(G.cone(0.02, 0.08, 4), k.gold, g, 0.03, -0.15 - i * 0.2, 0).rotation.z = -1.4; }
    if (t >= 5) { const gl = glowSprite(rc, 0.6, 0.3); gl.position.set(0.2, 0, 0); head.add(gl); }
    mk(G.sph(0.045, 6), t >= 3 ? k.glow : k.metal, g, 0, 0.14, 0);
    return g;
  }

  function wHammer(t, k, M, rc) {
    const g = group(null), len = 0.85 + t * 0.05;
    mk(G.cyl(0.034, 0.036, len + 0.15, 7), k.grip, g, 0, 0.12 - (len + 0.15) / 2, 0);
    const head = group(g, 0, -len + 0.12, 0), hw = 0.3 + t * 0.045, hh = 0.19 + t * 0.025;
    mk(G.box(hw, hh, hh), k.metal, head, 0, 0, 0);
    for (const s of [-1, 1]) mk(G.box(0.05, hh * 1.12, hh * 1.12), t >= 1 ? k.gold : k.metal, head, s * (hw / 2 - 0.03), 0, 0);
    if (t >= 2) for (const s of [-1, 1]) mk(G.cone(0.05, 0.12, 4), k.gold, head, s * (hw / 2 + 0.05), 0, 0).rotation.z = -s * Math.PI / 2;
    if (t >= 3) mk(G.box(hw * 0.5, hh * 1.02, hh * 1.02), k.glow, head, 0, 0, 0);
    if (t >= 4) for (const s of [-1, 1]) { const h = mk(G.cone(0.03, 0.2, 5), k.gold, head, s * 0.08, hh / 2 + 0.08, 0); h.rotation.z = s * -0.4; }
    if (t >= 5) { for (const s of [-1, 1]) { const w = mk(G.box(0.2, 0.08, 0.012), k.white, head, s * 0.15, hh / 2 + 0.1, 0); w.rotation.z = 0.5 * s; } head.add(glowSprite(rc, 0.6, 0.3)); }
    return g;
  }

  function wJavelin(t, k, M, rc) {
    const g = group(null), len = 1.0 + t * 0.06;
    mk(G.cyl(0.024, 0.026, len, 6), k.grip, g, 0, 0.25 - len / 2, 0);
    const tl = 0.18 + t * 0.035, end = 0.25 - len;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.06 + t * 0.008, -tl * 0.4, 0, -tl); sh.quadraticCurveTo(-0.06 - t * 0.008, -tl * 0.4, 0, 0);
    mk(extrudeG(sh, 0.014), k.metal, g, 0, end, 0);
    if (t >= 2) mk(G.box(0.16, 0.025, 0.03), k.gold, g, 0, end + 0.02, 0);
    if (t >= 3) { mk(G.oct(0.035), k.glow, g, 0, end + 0.04, 0.02); for (const s of [-1, 1]) { const f = mk(G.box(0.1, 0.08, 0.01), k.edge, g, s * 0.05, end + 0.12, 0); f.rotation.z = s * 0.6; } }
    if (t >= 4) for (const s of [-1, 1]) mk(G.cone(0.015, 0.07, 4), k.gold, g, s * 0.035, end - tl * 0.3, 0).rotation.z = s * 2.5;
    mk(G.box(0.1, 0.1, 0.01), t >= 3 ? k.edge : M('#f0f0f0'), g, 0, 0.2, 0);
    if (t >= 5) { const gl = glowSprite(rc, 0.55, 0.3); gl.position.y = end - 0.05; g.add(gl); }
    return g;
  }

  function wStaff(t, k, M, rc) {
    const g = group(null), len = 1.45 + t * 0.06, end = 0.3 - len;
    mk(G.cyl(0.034, 0.042, len, 7), k.grip, g, 0, 0.3 - len / 2, 0);
    if (t >= 1) for (let i = 0; i < 2; i++) mk(G.cyl(0.046, 0.046, 0.04, 8), k.gold, g, 0, end + 0.25 + i * 0.5, 0);
    const R0 = 0.1 + t * 0.016;
    const orb = mk(G.ico(R0, 1), k.glow, g, 0, end - R0 * 0.7, 0);
    const gl = glowSprite(rc, 0.5 + t * 0.06, 0.5); gl.position.copy(orb.position); g.add(gl);
    if (t >= 1) for (let i = 0; i < 3 + (t >= 3 ? 1 : 0); i++) { const a = (i / (3 + (t >= 3 ? 1 : 0))) * Math.PI * 2; const c = mk(G.cone(0.02, R0 * 2.2, 4), k.metal, g, Math.cos(a) * R0 * 0.8, end - R0 * 0.3, Math.sin(a) * R0 * 0.8); c.rotation.set(Math.sin(a) * 0.5, 0, Math.PI - Math.cos(a) * 0.5); }
    if (t >= 3) { const rg = mk(G.torus(R0 * 1.6, 0.012), k.edge, g, 0, end - R0 * 0.7, 0); rg.rotation.x = 1.2; g.userData.spin = rg; }
    if (t >= 4) for (const s of [-1, 1]) { const h = mk(G.cone(0.03, 0.25, 5), k.gold, g, s * 0.08, end + 0.05, 0); h.rotation.z = s * 0.5 + Math.PI; }
    if (t >= 5) { mk(G.torus(R0 * 2.1, 0.012), k.glow, g, 0, end - R0 * 0.7, 0); for (const s of [-1, 1]) { const w = mk(G.box(0.26, 0.1, 0.012), k.white, g, s * 0.16, end + 0.1, 0); w.rotation.z = -0.5 * s; } }
    g.userData.orb = orb; g.userData.glow = gl;
    return g;
  }

  function wScepter(t, k, M, rc) {
    const g = group(null), len = 0.65 + t * 0.04, end = 0.1 - len;
    mk(G.cyl(0.028, 0.03, len, 7), k.gold, g, 0, 0.1 - len / 2, 0);
    mk(G.torus(0.11 + t * 0.012, 0.022), k.gold, g, 0, end - 0.1, 0);
    const gem = mk(G.oct(0.07 + t * 0.01), k.glow, g, 0, end - 0.1, 0);
    const gl = glowSprite(rc, 0.45 + t * 0.05, 0.5); gl.position.copy(gem.position); g.add(gl);
    if (t >= 2) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const c = mk(G.cone(0.018, 0.1 + t * 0.012, 4), k.edge, g, Math.cos(a) * (0.16 + t * 0.012), end - 0.1 + Math.sin(a) * (0.16 + t * 0.012), 0); c.rotation.z = a - Math.PI / 2; }
    if (t >= 3) mk(G.torus(0.2 + t * 0.012, 0.01), k.glow, g, 0, end - 0.1, 0).rotation.y = Math.PI / 2;
    if (t >= 5) for (const s of [-1, 1]) { const w = mk(G.box(0.22, 0.08, 0.012), k.white, g, s * 0.16, end + 0.02, 0); w.rotation.z = -0.5 * s; }
    g.userData.orb = gem; g.userData.glow = gl;
    return g;
  }

  const W_BUILD = { foice: wScythe, arco: wBow, espada: wSword, machado: wAxe, martelo: wHammer, dardo: wJavelin, cajado: wStaff, cetro: wScepter, lanca: wScythe };
  function buildWeaponT(wt, it, M) {
    const t = it ? tierOf(it) : 0, rc = it && rarIdx(it) > 0 ? rarOf(it).color : (it ? '#e0d8c0' : '#c8c0b0');
    const k = gearMats(M, t, rc, it ? rarIdx(it) : 0, it ? it.refine : 0);
    const g = W_BUILD[wt](t, k, M, rc);
    g.userData.glowMats = [k.edge, k.glow];
    return g;
  }

  // ESCUDO — madeira, ferro, pipa, torre rúnica, dracônico com espinhos, celestial com asas
  function buildShieldT(hand, it, M) {
    const sh = group(hand, 0.12, 0, 0);
    const t = it ? tierOf(it) : 2, rc = it && rarIdx(it) > 0 ? rarOf(it).color : '#e0b040';
    const k = gearMats(M, t, rc, it ? rarIdx(it) : 0, it ? it.refine : 0);
    const face = t === 0 ? M('#8a6038', { r: 0.9 }) : k.metal;
    if (t <= 1) {
      const c = mk(G.cyl(0.3, 0.3, 0.06, 18), face, sh, 0, 0, 0); c.rotation.z = Math.PI / 2;
      const rim = mk(G.torus(0.3, 0.025), t ? k.gold : M('#5a4020'), sh, 0, 0, 0); rim.rotation.y = Math.PI / 2;
      mk(G.sph(0.07, 8), k.gold, sh, 0.04, 0, 0);
    } else {
      const H = 0.55 + (t - 2) * 0.1, Wd = 0.42 + (t - 2) * 0.05;
      const s = new THREE.Shape(); s.moveTo(-Wd / 2, H / 2); s.lineTo(Wd / 2, H / 2); s.lineTo(Wd / 2, -H * 0.1); s.quadraticCurveTo(Wd * 0.3, -H * 0.4, 0, -H / 2); s.quadraticCurveTo(-Wd * 0.3, -H * 0.4, -Wd / 2, -H * 0.1); s.lineTo(-Wd / 2, H / 2);
      const p = mk(extrudeG(s, 0.05), face, sh, 0, 0, 0); p.rotation.y = Math.PI / 2;
      const em = mk(G.box(0.07, H * 0.7, 0.07), k.edge, sh, 0.035, 0, 0); mk(G.box(0.07, 0.07, Wd * 0.6), k.edge, sh, 0.035, H * 0.12, 0);
      if (t >= 3) mk(G.oct(0.09), k.glow, sh, 0.07, H * 0.12, 0);
      if (t >= 4) for (const [y, z] of [[H * 0.45, Wd * 0.45], [H * 0.45, -Wd * 0.45], [-H * 0.3, Wd * 0.4], [-H * 0.3, -Wd * 0.4]]) mk(G.cone(0.03, 0.14, 4), k.gold, sh, 0.06, y, z).rotation.z = -Math.PI / 2;
      if (t >= 5) { for (const s2 of [-1, 1]) { const w = mk(G.box(0.02, 0.18, 0.34), k.white, sh, 0.02, H * 0.35, s2 * (Wd / 2 + 0.12)); w.rotation.x = s2 * -0.5; } const gl = glowSprite(rc, 0.6, 0.3); gl.position.x = 0.1; sh.add(gl); }
    }
    return sh;
  }

  // ELMO dos modelos: capuz de couro, meio-elmo, elmo fechado, rúnico com chifres, dracônico com crista, celestial com auréola
  function buildHelmetModel(hg, it, M) {
    const t = tierOf(it), rc = rarIdx(it) > 0 ? rarOf(it).color : '#d0b060';
    const k = gearMats(M, t, rc, rarIdx(it), it.refine);
    const R0 = 0.5, cy = 0.42;
    const cap = mk(new THREE.SphereGeometry(R0, 18, 10, 0, Math.PI * 2, 0, Math.PI * (t === 0 ? 0.42 : 0.52)), t === 0 ? M('#7a5030', { r: 0.9 }) : k.metal, hg, 0, cy, 0);
    cap.scale.set(1.04, 1, 1.04);
    const band = mk(G.torus(R0 * (t === 0 ? 0.92 : 1.0), 0.035 + t * 0.004), k.edge, hg, 0, cy - (t === 0 ? 0.0 : 0.02), 0); band.rotation.x = Math.PI / 2;
    if (t >= 1) mk(G.box(0.06, 0.26, 0.08), k.metal, hg, R0 * 0.98, cy - 0.12, 0);
    if (t >= 2) { for (const z of [-1, 1]) { const ch = mk(G.box(0.05, 0.3, 0.18), k.metal, hg, R0 * 0.62, cy - 0.18, z * R0 * 0.78); ch.rotation.y = z * 0.6; } mk(G.box(0.5, 0.06, 0.06), k.gold, hg, -0.05, cy + R0 * 0.96, 0); }
    if (t >= 3) { mk(G.oct(0.06), k.glow, hg, R0 * 0.92, cy + 0.12, 0); }
    if (t === 3) for (const z of [-1, 1]) { const h = mk(G.cone(0.07, 0.42, 6), M('#ece4cc'), hg, 0, cy + 0.3, z * R0 * 0.85); h.rotation.x = z * 0.9; }
    if (t === 4) { for (let i = 0; i < 5; i++) mk(G.cone(0.06, 0.3 - i * 0.04, 4), k.gold, hg, 0.2 - i * 0.12, cy + R0 * 0.95 + 0.1, 0); for (const z of [-1, 1]) { const h = mk(G.cone(0.06, 0.5, 6), M('#2a1010'), hg, -0.25, cy + 0.2, z * 0.38); h.rotation.z = 1.1; h.rotation.x = z * 0.3; } }
    if (t === 5) {
      mk(G.torus(0.3, 0.022), M('#fff0a0', { e: '#ffd860', ei: 0.8 }), hg, 0, cy + R0 + 0.25, 0).rotation.x = Math.PI / 2;
      for (const z of [-1, 1]) { const w = mk(G.box(0.4, 0.2, 0.02), k.white, hg, -0.1, cy + 0.25, z * R0 * 1.02); w.rotation.z = 0.6; }
    }
  }

  // peças de armadura presas aos ossos dos modelos
  function attachArmor(md, eq, M) {
    const inv = 1 / md.scale, B = (n) => md.obj.getObjectByName(n);
    const piece = (bone) => { const b = B(bone); if (!b) return null; const g = group(b); g.scale.setScalar(inv); return g; };
    if (eq.luvas) {
      const t = tierOf(eq.luvas), rc = rarOf(eq.luvas).color, k = gearMats(M, t, rc, rarIdx(eq.luvas), eq.luvas.refine);
      for (const side of ['l', 'r']) {
        const g = piece('wrist' + side); if (!g) continue;
        const cuff = mk(G.cyl(0.085 + t * 0.006, 0.075, 0.09, 10), k.metal, g, 0, 0.02, 0);
        mk(G.cyl(0.09 + t * 0.006, 0.09 + t * 0.006, 0.025, 10), k.edge, g, 0, 0.065, 0);
        if (t >= 3) mk(G.oct(0.03), k.glow, g, 0.06, 0.02, 0);
        if (t >= 4) for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; mk(G.cone(0.015, 0.07, 4), k.gold, g, Math.cos(a) * 0.08, 0.03, Math.sin(a) * 0.08).rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4); }
      }
    }
    if (eq.botas) {
      const t = tierOf(eq.botas), rc = rarOf(eq.botas).color, k = gearMats(M, t, rc, rarIdx(eq.botas), eq.botas.refine);
      for (const side of ['l', 'r']) {
        const g = piece('lowerleg' + side); if (!g) continue;
        mk(G.cyl(0.1 + t * 0.006, 0.09, 0.16 + t * 0.02, 10), k.metal, g, 0, 0.12, 0);
        mk(G.cyl(0.105 + t * 0.006, 0.105 + t * 0.006, 0.025, 10), k.edge, g, 0, 0.21 + t * 0.01, 0);
        if (t >= 3) { const kn = mk(G.sph(0.06, 8), k.metal, g, 0, 0.27, 0.06); kn.scale.set(1, 0.8, 0.6); mk(G.oct(0.025), k.glow, g, 0, 0.27, 0.1); }
        if (t >= 4) mk(G.cone(0.02, 0.09, 4), k.gold, g, 0, 0.3, 0.1).rotation.x = 1.2;
      }
    }
    if (eq.armadura) {
      const t = tierOf(eq.armadura), rc = rarOf(eq.armadura).color, k = gearMats(M, t, rc, rarIdx(eq.armadura), eq.armadura.refine);
      for (const side of ['l', 'r']) {
        const g = piece('upperarm' + side); if (!g) continue;
        const p = mk(G.sph(0.13 + t * 0.018, 10, 0), k.metal, g, 0, 0.05, 0); p.scale.set(1.15, 0.8, 1.15);
        mk(G.torus(0.12 + t * 0.017, 0.016), k.edge, g, 0, 0.0, 0).rotation.x = Math.PI / 2;
        if (t >= 2) { const p2 = mk(G.sph(0.1 + t * 0.012, 8), k.metal, g, 0, 0.13, 0); p2.scale.set(1, 0.45, 1); }
        if (t >= 4) for (let i = 0; i < 3; i++) mk(G.cone(0.025, 0.14 + i * 0.03, 4), k.gold, g, (i - 1) * 0.06, 0.18, 0);
        if (t >= 5) mk(G.oct(0.04), k.glow, g, 0, 0.12, 0.12);
      }
      const c = piece('chest');
      if (c && rarIdx(eq.armadura) >= 1) { mk(G.oct(0.05 + t * 0.008), k.glow, c, 0, 0.18, 0.3); const gl = glowSprite(rc, 0.3, 0.45); gl.position.set(0, 0.18, 0.33); c.add(gl); }
    }
    if (eq.anel) {
      const rc = rarOf(eq.anel).color, g = piece('handl');
      if (g) { mk(G.torus(0.05, 0.012), M(rc, { e: rc, ei: 1.2 }), g, 0, 0.06, 0); const gl = glowSprite(rc, 0.3, 0.7); gl.position.y = 0.06; g.add(gl); }
    }
  }

  // ---------- modelos 3D (KayKit, CC0) ----------
  const MODEL_DIR = 'assets/models/';
  const MODEL_FILES = ['Barbarian', 'Knight', 'Mage', 'Rogue', 'Rogue_Hooded', 'Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior', 'skel_props'];
  const Assets = { state: 'idle', gltf: {}, clips: {}, height: {} };
  const HERO_MODEL = {
    gladiador:  { m: 'Barbarian', hat: 'Barbarian_Hat', cape: 'Barbarian_Cape', capeDefault: true },
    engenheiro: { m: 'Knight', tint: '#b8c4d8', hat: 'Knight_Helmet', hatDefault: true, cape: 'Knight_Cape' },
    cacadora:   { m: 'Rogue_Hooded', tint: '#c8ecc0', cape: 'Rogue_Cape', capeDefault: true },
    lanceiro:   { m: 'Rogue', tint: '#c0c4dc', cape: 'Rogue_Cape', capeDefault: true },
    paladino:   { m: 'Knight', tint: '#fff6e0', hat: 'Knight_Helmet', cape: 'Knight_Cape', capeDefault: true },
    valquiria:  { m: 'Rogue', tint: '#d0dcff', cape: 'Rogue_Cape', capeDefault: true },
    arcanista:  { m: 'Mage', hat: 'Mage_Hat', hatDefault: true, cape: 'Mage_Cape', capeDefault: true },
    cleriga:    { m: 'Mage', tint: '#fffaf2', l: 'Spellbook_open', cape: 'Mage_Cape', capeDefault: true },
  };
  const MON_MODEL = {
    'Goblin Ladrão':      { m: 'Skeleton_Rogue', tint: '#9ae070', r: 'Skeleton_Blade', s: 0.8 },
    'Zumbi do Brejo':     { m: 'Skeleton_Minion', tint: '#9ccc88' },
    'Bruxa do Pântano':   { m: 'Skeleton_Mage', tint: '#c090e0', r: 'Skeleton_Staff', mage: true },
    'Minerador Maldito':  { m: 'Skeleton_Minion', tint: '#e8d8a0', r: 'Skeleton_Axe' },
    'Múmia Errante':      { m: 'Skeleton_Minion', tint: '#f0e4c0' },
    'Faraó Esquecido':    { m: 'Skeleton_Mage', tint: '#ffd870', r: 'Skeleton_Staff', mage: true },
    'Esqueleto Guerreiro':{ m: 'Skeleton_Warrior', r: 'Skeleton_Blade', l: 'Skeleton_Shield_Small_A' },
    'Ghoul':              { m: 'Skeleton_Rogue', tint: '#90b090', r: 'Skeleton_Blade' },
    'Lich Ancião':        { m: 'Skeleton_Mage', tint: '#c8a8ff', r: 'Skeleton_Staff', mage: true },
    'Cavaleiro Demônio':  { m: 'Skeleton_Warrior', tint: '#ff7a68', r: 'Skeleton_Axe', l: 'Skeleton_Shield_Large_A' },
    'Ciclope':            { m: 'Skeleton_Warrior', tint: '#d8b080', r: 'Skeleton_Axe', s: 1.45 },
    'Anjo Caído':         { m: 'Skeleton_Rogue', tint: '#8080b0', r: 'Skeleton_Blade' },
  };
  const NPC_MODEL = {
    mercador: { m: 'Rogue', tint: '#c8f0d0', anim: 'Idle' },
    ferreiro: { m: 'Barbarian', r: '1H_Axe', anim: '1H_Melee_Attack_Chop', loop: true },
    portal:   { m: 'Mage', tint: '#b8c8ff', r: '2H_Staff', hat: 'Mage_Hat', cape: 'Mage_Cape', anim: 'Spellcast_Long', loop: true },
    mestra:   { m: 'Mage', tint: '#fffaf0', l: 'Spellbook_open', cape: 'Mage_Cape', anim: 'Idle' },
    guarda:   { m: 'Knight', tint: '#ffd8d0', hat: 'Knight_Helmet', cape: 'Knight_Cape', r: '1H_Sword', l: 'Badge_Shield', anim: 'Idle_Combat' },
  };

  function loadAssets() {
    if (Assets.state !== 'idle' || !THREE.GLTFLoader || !THREE.SkeletonUtils) return;
    Assets.state = 'loading';
    const loader = new THREE.GLTFLoader();
    const files = [...MODEL_FILES, 'anims'];
    let left = files.length, fail = 0;
    const done = () => {
      if (--left > 0) return;
      Assets.state = fail || !Object.keys(Assets.clips).length ? 'failed' : 'ready';
      if (Assets.state === 'ready') { curCls = null; curZone = null; }
    };
    for (const f of files) {
      // tenta .glb (binário, menor); se não existir, a versão glTF em JSON
      const tryLoad = (ok, fail) => loader.load(MODEL_DIR + f + '.glb', ok, undefined, () => loader.load(MODEL_DIR + f + '.json', ok, undefined, fail));
      tryLoad((g) => {
        if (f === 'anims') for (const c of g.animations) Assets.clips[c.name] = c;
        else {
          Assets.gltf[f] = g;
          if (f !== 'skel_props') {
            // altura real: posição do osso da cabeça na pose de repouso
            g.scene.updateMatrixWorld(true);
            const hd = g.scene.getObjectByName('head'), v = new THREE.Vector3();
            Assets.height[f] = hd ? hd.getWorldPosition(v).y * 1.9 : 2.4;
          }
        }
        done();
      }, (e) => { fail++; console.warn('Falha ao carregar modelo', f, e && e.message); done(); });
    }
  }
  const modelsReady = () => Assets.state === 'ready';

  // instancia um modelo com materiais próprios; esconde acessórios
  function instModel(name, height, tint) {
    const src = Assets.gltf[name];
    const obj = THREE.SkeletonUtils.clone(src.scene);
    const mats = [];
    obj.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        if (tint) o.material.color = new THREE.Color(tint);
        o.material.userData.baseEmissive = o.material.emissive.clone(); o.material.userData.baseEI = o.material.emissiveIntensity;
        o.castShadow = true; o.frustumCulled = false;
        mats.push(o.material);
      }
    });
    const bones = { r: obj.getObjectByName('handslotr'), l: obj.getObjectByName('handslotl'), head: obj.getObjectByName('head'), chest: obj.getObjectByName('chest') };
    for (const k of ['r', 'l', 'head', 'chest']) if (bones[k]) for (const c of bones[k].children) if (!c.isBone && (c.isMesh || c.children.some((x) => x.isMesh))) c.visible = false;
    const sc = height / (Assets.height[name] || 2);
    obj.scale.setScalar(sc);
    obj.rotation.y = Math.PI / 2; // modelos olham para +z; o jogo usa +x como frente
    const mixer = new THREE.AnimationMixer(obj);
    return { obj, mats, bones, mixer, scale: sc };
  }
  function showPart(model, name, on = true) {
    const o = model.obj.getObjectByName(name);
    if (o) { o.visible = on; return o; }
    return null;
  }
  function propMesh(name) {
    const p = Assets.gltf.skel_props; if (!p) return null;
    const src = p.scene.getObjectByName(name); if (!src) return null;
    const o = src.clone(true);
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0);
    o.traverse((c) => { if (c.isMesh) { c.material = c.material.clone(); c.material.userData.baseEmissive = c.material.emissive.clone(); c.material.userData.baseEI = c.material.emissiveIntensity; c.castShadow = true; } });
    return o;
  }

  function playAnim(ent, name, o = {}) {
    if (!ent || !ent.model) return 0;
    const clip = Assets.clips[name]; if (!clip) return 0;
    const md = ent.model;
    const act = md.mixer.clipAction(clip);
    const loop = o.loop !== false;
    if (loop && md.curName === name) return clip.duration;
    act.reset();
    act.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    act.clampWhenFinished = !!o.clamp;
    act.timeScale = o.dur ? clip.duration / o.dur : (o.speed || 1);
    act.setEffectiveWeight(1);
    act.play();
    if (md.cur && md.cur !== act) md.cur.crossFadeTo(act, o.fade ?? 0.12, false);
    md.cur = act; md.curName = name;
    md.busyUntil = loop ? 0 : now() + (o.dur || clip.duration / (o.speed || 1)) * (o.hold ?? 0.9);
    return o.dur || clip.duration;
  }

  function attackDur() {
    const d = typeof derived === 'function' ? derived() : null;
    return clamp(d ? 0.95 / d.aps : 0.7, 0.45, 0.85);
  }
  function heroAttackClip(skill) {
    const h = st.hero, wt = h.wt, two = h.twoHand;
    h.swing = (h.swing || 0) + 1;
    const alt = h.swing % 2;
    switch (wt) {
      case 'machado': return skill ? (two ? '2H_Melee_Attack_Spin' : '1H_Melee_Attack_Jump_Chop') : (two ? (alt ? '2H_Melee_Attack_Chop' : '2H_Melee_Attack_Slice') : (alt ? '1H_Melee_Attack_Chop' : '1H_Melee_Attack_Slice_Diagonal'));
      case 'martelo': return skill ? '1H_Melee_Attack_Jump_Chop' : (alt ? '1H_Melee_Attack_Chop' : '1H_Melee_Attack_Slice_Diagonal');
      case 'espada': return skill ? '1H_Melee_Attack_Jump_Chop' : (alt ? '1H_Melee_Attack_Slice_Horizontal' : '1H_Melee_Attack_Slice_Diagonal');
      case 'foice': case 'lanca': return skill ? '2H_Melee_Attack_Spin' : (alt ? '2H_Melee_Attack_Slice' : '2H_Melee_Attack_Chop');
      case 'arco': return '2H_Ranged_Shoot';
      case 'dardo': return 'Throw';
      default: return skill ? 'Spellcast_Long' : 'Spellcast_Shoot';
    }
  }

  const TWO_HAND = { foice: 1, cajado: 1, arco: 1 };
  function buildHeroModel(cls) {
    const cfg = HERO_MODEL[cls]; if (!cfg || !Assets.gltf[cfg.m]) return null;
    const eq = {};
    for (const k of ['arma', 'armadura', 'elmo', 'luvas', 'botas', 'escudo', 'amuleto', 'anel']) if (S.equip[k] && (k !== 'arma' || CLASSES[cls].anyWeapon || S.equip[k].wtype === CLASSES[cls].weapon)) eq[k] = S.equip[k];
    const wt = eq.arma ? eq.arma.wtype : CLASSES[cls].weapon;
    const aT = eq.armadura ? tierOf(eq.armadura) : -1;
    let tint = cfg.tint || '#ffffff';
    if (aT >= 0) tint = mixCol(tint, TIER_COL[aT], 0.3);
    const md = instModel(cfg.m, 1.75, tint);
    const root = group(null), inner = group(root);
    inner.rotation.y = -0.45;
    inner.add(md.obj);
    const M = matFactory(md.mats);
    // arma (6 visuais por tipo, conforme o nível do item)
    const twoHand = !!TWO_HAND[wt];
    const hand = wt === 'arco' ? md.bones.l : md.bones.r;
    const holder = group(hand);
    holder.scale.setScalar(1 / md.scale);
    if (wt === 'arco') holder.rotation.set(0, Math.PI / 2, 0); else holder.rotation.set(Math.PI, 0, 0);
    const weapon = buildWeaponT(wt, eq.arma, M);
    holder.add(weapon);
    // escudo
    if (!twoHand && (eq.escudo || cls === 'paladino') && md.bones.l) {
      const sh = group(md.bones.l); sh.scale.setScalar(1 / md.scale); sh.rotation.set(0, 0, Math.PI / 2);
      buildShieldT(sh, eq.escudo, M);
    }
    if (cfg.l && !eq.escudo) showPart(md, cfg.l);
    // elmo (6 modelos) ou chapéu padrão da classe
    if (eq.elmo && md.bones.head) {
      const hg = group(md.bones.head); hg.scale.setScalar(1 / md.scale);
      buildHelmetModel(hg, eq.elmo, M);
    } else if (cfg.hat && cfg.hatDefault) showPart(md, cfg.hat);
    // capa a partir do tier 2 da armadura (ou padrão da classe)
    if (cfg.cape && (aT >= 2 || cfg.capeDefault)) {
      const cp = showPart(md, cfg.cape);
      if (cp && eq.armadura) cp.traverse((o) => { if (o.isMesh) o.material.color = new THREE.Color(rarIdx(eq.armadura) > 0 ? rarOf(eq.armadura).color : TIER_COL[aT]).lerp(new THREE.Color('#ffffff'), 0.2); });
    }
    attachArmor(md, eq, M);
    if (eq.amuleto && md.bones.chest) {
      const ac = rarOf(eq.amuleto).color, g = group(md.bones.chest); g.scale.setScalar(1 / md.scale);
      mk(G.oct(0.06), M(ac, { e: ac, ei: 1.4 }), g, 0.12, 0.3, 0.27);
      const gl = glowSprite(ac, 0.4, 0.8); gl.position.set(0.12, 0.3, 0.3); g.add(gl);
    }
    // aura de buff
    const aura = mk(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: '#ffd860', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), root, 0, 0.03, 0, false);
    aura.rotation.x = -Math.PI / 2;
    const auraGlow = glowSprite('#ffd860', 2.4, 0); auraGlow.position.set(0, 1, 0); root.add(auraGlow);
    const h = { root, inner, model: md, mats: md.mats, wt, aura, auraGlow, twoHand, weapon, atk: null, hurt: -9, x: 0 };
    playAnim(h, 'Idle');
    return h;
  }

  function animHeroModel(t, dt) {
    const h = st.hero, wt = h.wt, melee = !RANGED[wt], md = h.model;
    const a = h.atk ? clamp((t - h.atk.start) / h.atk.dur, 0, 1) : 1;
    if (h.atk && a >= 1) h.atk = null;
    const dead = R.dead > 0;
    if (!R.inTown) heroFollowWorld(h, dt);
    // estado da animação
    if (dead) { if (md.curName !== 'Death_A') playAnim(h, 'Death_A', { loop: false, clamp: true, fade: 0.1 }); }
    else if (md.curName === 'Death_A') playAnim(h, 'Idle', { fade: 0.3 });
    else if (now() >= (md.busyUntil || 0)) {
      if (R.inTown) playAnim(h, h.walk ? 'Walking_A' : 'Idle', { fade: 0.2 });
      else if (st.run) playAnim(h, 'Running_A', { fade: 0.15 });
      else playAnim(h, st.mon ? 'Idle_Combat' : 'Idle', { fade: 0.2 });
    }
    md.mixer.update(dt);
    setFlash(h.mats, t - h.hurt < 0.15 ? 0.6 : 0, '#ff6060');
    const buffOn = !R.inTown && R.buffs && R.buffs.length > 0;
    h.aura.material.opacity = lerp(h.aura.material.opacity, buffOn ? 0.55 + Math.sin(t * 4) * 0.15 : 0, Math.min(1, dt * 6));
    h.aura.rotation.z += dt; h.auraGlow.material.opacity = h.aura.material.opacity * 0.35;
  }

  function buildMonsterModel(name, boss) {
    const cfg = MON_MODEL[name]; if (!cfg || !Assets.gltf[cfg.m]) return null;
    const md = instModel(cfg.m, 1.8 * (cfg.s || 1), cfg.tint);
    const root = group(null), inner = group(root), body = group(inner);
    inner.rotation.y = 0.45;
    md.obj.rotation.y = -Math.PI / 2;
    body.add(md.obj);
    for (const [slot, pn] of [['r', cfg.r], ['l', cfg.l]]) {
      if (!pn || !md.bones[slot]) continue;
      const p = propMesh(pn); if (!p) continue;
      md.bones[slot].add(p);
      p.traverse((o) => { if (o.isMesh) { if (cfg.tint) o.material.color = new THREE.Color(cfg.tint).lerp(new THREE.Color('#ffffff'), 0.5); md.mats.push(o.material); } });
    }
    const P = { legs: [], arms: [], wings: [], segs: [], tent: [], float: 0 };
    if (boss) {
      const ring = mk(new THREE.RingGeometry(0.9, 1.15, 40), new THREE.MeshBasicMaterial({ color: '#b060ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }), root, 0, 0.03, 0, false);
      ring.rotation.x = -Math.PI / 2; P.bossRing = ring;
      const gl = glowSprite('#b060ff', 3, 0.25); gl.position.y = 1; root.add(gl);
    }
    root.scale.setScalar(boss ? 1.6 : 1);
    const m = { root, inner, body, P, mats: md.mats, model: md, kind: 'humanoid', boss, color: cfg.tint || '#e0dcd0', seed: Math.random() * 10, hurt: -9, atk: 0, mage: !!cfg.mage };
    playAnim(m, 'Spawn_Ground_Skeletons', { loop: false, speed: 1.6, hold: 0.85 });
    return m;
  }
  function animMonsterModel(m, t, dt) {
    const md = m.model;
    if (m.dieAt && t > m.dieAt) { if (md.curName !== 'Death_C_Skeletons') playAnim(m, 'Death_C_Skeletons', { loop: false, clamp: true, fade: 0.08, speed: 1.3 }); }
    else if (now() >= (md.busyUntil || 0)) playAnim(m, m.ref && m.ref.moving ? (m.ref.aggro ? 'Running_C' : 'Walking_D_Skeletons') : 'Idle_Combat', { fade: 0.2 });
    md.mixer.update(dt);
    if (m.P.bossRing) { m.P.bossRing.rotation.z += dt; m.P.bossRing.material.opacity = 0.4 + Math.sin(t * 3) * 0.15; }
  }

  // ---------- mundo aberto (mapa isométrico) ----------
  function buildWorld(zid) {
    disposeEnv();
    const th = THEMES[zid] || THEMES.z1, M = matFactory(null), root = group(null);
    const dark = th.cave || th.amb === 'star' || th.amb === 'wisp';
    scene.background = skyTex(th.sky[0], th.sky[1]);
    scene.fog = new THREE.Fog(th.sky[1], 24, 68);
    root.add(new THREE.HemisphereLight(th.sky[1], th.g[1], dark ? 0.75 : 0.85));
    const sun = new THREE.DirectionalLight(th.amb === 'ember' ? '#ffa060' : dark ? '#b0c0ff' : '#fff4e0', dark ? 0.8 : 1.05);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
    sun.shadow.bias = -0.0015; root.add(sun); root.add(sun.target);
    const fill = new THREE.DirectionalLight('#ffffff', dark ? 0.45 : 0.3); fill.position.set(-8, 10, 12); root.add(fill);
    if (dark) { const rim = new THREE.DirectionalLight(th.dc, 0.5); rim.position.set(8, 6, -10); root.add(rim); }
    const gtex = groundTex(th.g[0], th.g[1]); gtex.repeat.set(24, 24);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: gtex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
    const r = seeded(ZONES.findIndex((z) => z.id === zid) * 131 + 7);
    // borda do mapa: montanhas e penhascos
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 + r() * 0.1, d = 39 + r() * 7, h = 5 + r() * 9;
      const m = mk(G.cone(4 + r() * 5, h, 6), M(i % 2 ? th.far : th.mid), root, Math.cos(a) * d, h / 2 - 0.3, Math.sin(a) * d, false);
      m.rotation.y = r() * 3; m.receiveShadow = true;
    }
    const camps = zoneCamps(zid), entry = WORLD.entry, arena = WORLD.arena;
    const free = (x, z, pad) => Math.hypot(x - entry.x, z - entry.z) > 5 + pad && Math.hypot(x - arena.x, z - arena.z) > 7 + pad && camps.every((c) => Math.hypot(x - c.x, z - c.z) > 3.6 + pad);
    for (let i = 0, n = 0; i < 500 && n < 110; i++) {
      const a = r() * Math.PI * 2, d = 4 + r() * 33, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!free(x, z, 0)) continue;
      const type = r() < 0.75 ? th.deco : (th.deco === 'crystal' || th.deco === 'spike' ? th.deco : 'rock');
      const p = buildProp(type, th, M); p.position.set(x, 0, z); p.scale.setScalar(1.2 + r() * 0.9); p.rotation.y = r() * 6.3;
      root.add(p); n++;
    }
    const tuftM = M(new THREE.Color(th.g[0]).multiplyScalar(0.78).getStyle());
    for (let i = 0; i < 260; i++) { const t = mk(G.cone(0.07, 0.15 + r() * 0.2, 4), tuftM, root, (r() - 0.5) * 70, 0.08, (r() - 0.5) * 70, false); t.rotation.y = r() * 3; }
    // acampamentos: anel de pedras e fogueira
    for (const c of camps) {
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; const st2 = mk(G.dod(0.35), M(th.dc === '#3a7a2a' ? '#8a8070' : th.mid), root, c.x + Math.cos(a) * 3.4, 0.15, c.z + Math.sin(a) * 3.4); st2.scale.y = 0.6; }
      mk(G.cyl(0.5, 0.6, 0.15, 8), M('#3a2a20'), root, c.x, 0.07, c.z);
      const fire = glowSprite('#ff8030', 1.4, 0.7); fire.position.set(c.x, 0.5, c.z); root.add(fire);
    }
    // arena do chefe
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const h = 1.6 + (k % 2) * 0.6; mk(G.box(0.7, h, 0.5), M('#6a6470'), root, arena.x + Math.cos(a) * 6, h / 2, arena.z + Math.sin(a) * 6).rotation.y = -a; }
    const rune = mk(new THREE.RingGeometry(4.2, 4.6, 48), new THREE.MeshBasicMaterial({ color: '#b060ff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }), root, arena.x, 0.03, arena.z, false);
    rune.rotation.x = -Math.PI / 2;
    // entrada: duas tochas
    for (const sx of [-2, 2]) { mk(G.cyl(0.08, 0.1, 1.8, 6), M('#4a3a2a'), root, entry.x + sx, 0.9, entry.z + 1.5); const tg = glowSprite('#ffb050', 1.2, 0.8); tg.position.set(entry.x + sx, 1.9, entry.z + 1.5); root.add(tg); }
    scene.add(root);
    env = { root, gtex, far: [], mid: [], props: [], scatter: [], ceil: [], th, stars: null, world: true, sun, rune };
  }

  // anel do alvo, marcador de movimento e barrinhas de vida
  let tRing = null;
  const barEls = new Map();
  function updateWorldUI(t) {
    if (!tRing) {
      tRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 32), new THREE.MeshBasicMaterial({ color: '#ff4040', transparent: true, opacity: 0.8, depthWrite: false }));
      tRing.rotation.x = -Math.PI / 2; scene.add(tRing);
    }
    const tg = st.mon;
    tRing.visible = !!(tg && env && env.world);
    if (tRing.visible) { const s0 = tg.boss ? 1.9 : 1; tRing.position.set(tg.root.position.x, 0.04, tg.root.position.z); tRing.scale.setScalar(s0 * (1 + Math.sin(t * 6) * 0.06)); tRing.rotation.z += 0.02; }
    const layer = document.getElementById('mon-bars-layer'); if (!layer) return;
    const seen = new Set();
    if (env && env.world) for (const e of st.ents.values()) {
      const ref = e.ref; if (!ref || ref.hp <= 0) continue;
      const show = ref.boss || ref === R.mon || ref.hp < ref.maxHp || ref.aggro;
      if (!show) continue;
      seen.add(e.sid);
      let el = barEls.get(e.sid);
      if (!el) { el = document.createElement('div'); el.className = 'mbar' + (ref.boss ? ' boss' : ''); el.innerHTML = '<i></i>'; layer.appendChild(el); barEls.set(e.sid, el); }
      const p = monTop(e); tmpV.copy(p).project(camera);
      el.style.left = ((tmpV.x + 1) / 2 * W) + 'px'; el.style.top = ((1 - tmpV.y) / 2 * H) + 'px';
      el.firstChild.style.width = Math.max(0, ref.hp / ref.maxHp * 100) + '%';
      el.classList.toggle('tgt', ref === R.mon);
    }
    for (const [sid, el] of barEls) if (!seen.has(sid)) { el.remove(); barEls.delete(sid); }
  }
  function moveMarker(x, z) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 24), fxMat('#80ff9a', 0.9));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z);
    addFx({ obj: m, life: 0.6, upd: (f, p) => { m.scale.setScalar(1 + p * 2.5); m.material.opacity = 0.9 * (1 - p); }, dispose: true });
  }
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pickWorld(cx, cy) {
    const r = cv.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const roots = [...st.ents.values()].map((e) => e.root);
    const hit = raycaster.intersectObjects(roots, true).find((h) => h.object.isMesh && h.object.material && h.object.material.visible !== false);
    if (hit) {
      let o = hit.object; while (o && !o.userData.sid) o = o.parent;
      if (o) { window.gameOrder && window.gameOrder({ type: 'attack', sid: o.userData.sid }); return; }
    }
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, pt)) { window.gameOrder && window.gameOrder({ type: 'move', x: pt.x, z: pt.z }); moveMarker(pt.x, pt.z); }
  }

  // ---------- cidade ----------
  const NPC_LOOK = {
    mercador: { L: { body: '#3a7a5a', trim: '#e0c050', pants: '#4a3a2a', skin: '#e8b890', head: 'ponytail', hair: '#6a3a1a', robe: true }, wt: null, pos: [-3.5, -0.3] },
    ferreiro: { L: { body: '#5a3a2a', trim: '#8a8a8a', pants: '#3a3030', skin: '#d8a070', head: 'goggles', hair: '#2a1a10', bare: true }, wt: 'martelo', pos: [-2.1, -3.3] },
    portal:   { L: { body: '#2a3a8a', trim: '#80c0ff', pants: '#1a2050', skin: '#f0d0b0', head: 'wizard', hair: '#e0e0f0', robe: true }, wt: 'cajado', pos: [2.1, -3.3] },
    mestra:   { L: { body: '#f0e8d8', trim: '#a070d0', pants: '#c8c0a8', skin: '#f6d6bc', head: 'hood', hair: '#f0d080', robe: true }, wt: 'cetro', pos: [3.5, -0.3] },
    bau:      { chest: true, pos: [1.3, 0.5] },
    guarda:   { L: { body: '#7a8494', trim: '#c03030', pants: '#3a404a', skin: '#e8b890', head: 'helm', hair: '#5a4030' }, wt: 'espada', pos: [-1.4, 0.6] },
  };
  const NPC_NAMES = { mercador: 'Mercadora', ferreiro: 'Ferreiro', portal: 'Portais', mestra: 'Mestra', bau: 'Baú', guarda: 'Comandante' };
  const NPC_ICON = { mercador: '🛒', ferreiro: '🔨', portal: '🌀', mestra: '📜', bau: '🧰', guarda: '📋' };
  const HERO_TOWN = new THREE.Vector3(0, 0, 1.4);

  function buildTown() {
    disposeEnv();
    const M = matFactory(null);
    const root = group(null);
    const fac = CLASSES[S.cls].faction, FE = fac === 'ferro';
    const TT = FE
      ? { sky: ['#a8502a', '#f2c08a'], fog: '#e8b080', hemi: ['#ffd8b0', '#4a3a30'], sun: '#ffc890', ground: ['#6e665e', '#3e3a36'], plaza: '#7a726a', ring: '#4a4440', wall: ['#6a6058', '#5a524a'], roof: ['#3a3a44', '#4a4048', '#2e3038'], amb: 'ember', fountain: '#6a6058', water: ['#ff8030', '#ff5010'] }
      : { sky: ['#5aa8f0', '#eaf6ff'], fog: '#e2f0ff', hemi: ['#f0f8ff', '#8a9aa8'], sun: '#fff8e8', ground: ['#d8dce4', '#a8b0bc'], plaza: '#eef0f4', ring: '#b8c0cc', wall: ['#f4f0e8', '#ece6da'], roof: ['#3a6ad0', '#4a8ae0', '#2a5ab8'], amb: 'wisp', fountain: '#f0ece4', water: ['#60c8f0', '#3090d0'] };
    const th = { amb: TT.amb, sky: TT.sky };
    scene.background = skyTex(TT.sky[0], TT.sky[1]);
    scene.fog = new THREE.Fog(TT.fog, 16, 46);
    root.add(new THREE.HemisphereLight(TT.hemi[0], TT.hemi[1], 0.85));
    const sun = new THREE.DirectionalLight(TT.sun, 1.0);
    sun.position.set(4, 10, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0015; root.add(sun); root.add(sun.target);
    const fill = new THREE.DirectionalLight('#ffffff', 0.35); fill.position.set(0, 3, 10); root.add(fill);
    const gtex = groundTex(TT.ground[0], TT.ground[1]); gtex.repeat.set(20, 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 45), new THREE.MeshStandardMaterial({ map: gtex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = -10; ground.receiveShadow = true; root.add(ground);
    // praça circular
    const plaza = mk(new THREE.CircleGeometry(5.2, 40), M(TT.plaza, { flat: false }), root, 0, 0.01, -1.4, false);
    plaza.rotation.x = -Math.PI / 2; plaza.receiveShadow = true;
    const ringStone = mk(new THREE.RingGeometry(5.1, 5.4, 40), M(TT.ring), root, 0, 0.02, -1.4, false); ringStone.rotation.x = -Math.PI / 2;
    // fonte
    const fz = -1.5;
    mk(G.cyl(1.1, 1.2, 0.45, 20), M(TT.fountain), root, 0, 0.22, fz);
    const water = mk(G.cyl(0.98, 0.98, 0.05, 20), M(TT.water[0], { e: TT.water[1], ei: FE ? 1.2 : 0.35, flat: false, r: 0.1 }), root, 0, 0.44, fz, false);
    mk(G.cyl(0.18, 0.25, 1.1, 10), M(TT.fountain), root, 0, 0.9, fz);
    mk(G.cyl(0.5, 0.35, 0.15, 14), M(TT.fountain), root, 0, 1.45, fz);
    // casas
    const gears = [], chimneys = [], crystals = [];
    for (let i = 0; i < 9; i++) {
      const x = -13 + i * 3.3 + rand(-0.4, 0.4), z = -8.5 - (i % 2) * 1.5 - rand(0, 0.8), w = rand(2.2, 3), h = rand(2, 3.2);
      const hg = group(root, x, 0, z);
      mk(G.box(w, h, 2.2), M(TT.wall[i % 2]), hg, 0, h / 2, 0);
      mk(G.box(0.5, 0.9, 0.05), M(FE ? '#2a2420' : '#c8a060'), hg, 0, 0.45, 1.11);
      for (const wx of [-w / 3, w / 3]) mk(G.box(0.36, 0.36, 0.05), M(FE ? '#ffa040' : '#bfe8ff', { e: FE ? '#ff7010' : '#80c8ff', ei: 0.7 }), hg, wx, h * 0.62, 1.11, false);
      if (FE) {
        const roof = mk(G.box(w * 1.1, 0.25, 2.4), M(TT.roof[i % 3], { m: 0.2, r: 0.4 }), hg, 0, h + 0.12, 0);
        if (i % 2 === 0) { mk(G.cyl(0.22, 0.26, 1.4, 8), M('#4a4440'), hg, w * 0.3, h + 0.8, -0.3); chimneys.push(new THREE.Vector3(x + w * 0.3, h + 1.55, z - 0.3)); }
        if (i % 3 === 1) {
          const gear = group(hg, -w * 0.25, h * 0.7, 1.15);
          mk(G.torus(0.42, 0.08), M('#8a7a5a', { m: 0.2, r: 0.4 }), gear, 0, 0, 0, false);
          for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; mk(G.box(0.14, 0.16, 0.1), M('#8a7a5a'), gear, Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0, false).rotation.z = a; }
          mk(G.cyl(0.12, 0.12, 0.14, 10), M('#c09040'), gear, 0, 0, 0, false).rotation.x = Math.PI / 2;
          gears.push(gear);
        }
      } else {
        const dome = mk(G.sph(w * 0.42, 14), M(TT.roof[i % 3], { flat: false, r: 0.35 }), hg, 0, h, 0); dome.scale.y = 0.75;
        mk(G.cone(0.06, 0.5, 6), M('#f0d070', { e: '#a08020', ei: 0.4 }), hg, 0, h + w * 0.32 + 0.2, 0);
        for (const cx of [-w / 2 + 0.15, w / 2 - 0.15]) mk(G.cyl(0.12, 0.12, h, 10), M('#ffffff'), hg, cx, h / 2, 1.15);
      }
      hg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    }
    if (FE) {
      // canais de lava e grandes engrenagens
      for (const x of [-6.5, 6.5]) { const lv = mk(G.box(0.8, 0.04, 6), M('#ff6010', { e: '#ff4000', ei: 1.6 }), root, x, 0.03, -2.5, false); const gl = glowSprite('#ff6010', 3, 0.35); gl.position.set(x, 0.4, -2.5); root.add(gl); }
      const big = group(root, -9.5, 2.8, -6); mk(G.torus(1.3, 0.18), M('#6a5a40', { m: 0.2, r: 0.45 }), big, 0, 0, 0); for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; mk(G.box(0.3, 0.35, 0.25), M('#6a5a40'), big, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0).rotation.z = a; } gears.push(big);
    } else {
      // cristais flutuantes
      for (const [x, z] of [[-6.5, -4], [6.5, -4], [-8.5, 0.5], [8.5, 0.5], [0, -6.8]]) {
        const cg = group(root, x, 1.6, z);
        const cr = mk(G.oct(0.35), M('#9ae8ff', { e: '#60c8ff', ei: 1, r: 0.15, op: 0.85 }), cg, 0, 0, 0, false); cr.scale.y = 2;
        const gl = glowSprite('#80d8ff', 2.4, 0.5); cg.add(gl);
        mk(G.cyl(0.4, 0.5, 0.25, 10), M('#f0ece4'), root, x, 0.12, z);
        crystals.push(cg);
      }
    }
    // árvores e postes
    for (const [x, z] of (FE ? [[-9, 2], [9.5, 1.5]] : [[-5.5, -7], [5.8, -7], [-10, -3], [10, -3]])) {
      const p = buildProp('tree', { dc: '#4a8a3a' }, M); p.position.set(x, 0, z); p.scale.setScalar(rand(0.9, 1.2)); root.add(p);
    }
    const lamps = [];
    for (const [x, z] of [[-5, 1.5], [5, 1.5], [-5.4, -4.6], [5.4, -4.6]]) {
      mk(G.cyl(0.05, 0.07, 2.2, 6), M('#3a3a3a'), root, x, 1.1, z);
      mk(G.box(0.22, 0.28, 0.22), M('#ffe0a0', { e: '#ffc060', ei: 1.2 }), root, x, 2.3, z);
      const gl = glowSprite('#ffc060', 1.6, 0.6); gl.position.set(x, 2.3, z); root.add(gl); lamps.push(gl);
    }
    // estandartes da facção
    const fc = FACTIONS[CLASSES[S.cls].faction].color;
    for (const x of [-1.2, 1.2]) {
      mk(G.cyl(0.04, 0.04, 3, 6), M('#5a4a3a'), root, x, 1.5, -5.6);
      mk(G.box(0.7, 1.1, 0.03), M(fc, { flat: false }), root, x, 2.35, -5.58);
    }
    // NPCs
    const npcs = {};
    for (const [id, d] of Object.entries(NPC_LOOK)) {
      const g = group(root, d.pos[0], 0, d.pos[1]);
      let ch = null;
      if (d.chest) {
        mk(G.box(0.9, 0.5, 0.6), M('#7a4a22'), g, 0, 0.25, 0);
        const lid = mk(G.cyl(0.3, 0.3, 0.9, 10, 1), M('#8a5a2a'), g, 0, 0.5, 0); lid.rotation.z = Math.PI / 2; lid.scale.set(1, 1, 1);
        mk(G.box(0.95, 0.08, 0.65), M('#e0b040', { e: '#806010', ei: 0.3 }), g, 0, 0.5, 0);
        mk(G.box(0.14, 0.18, 0.05), M('#e0b040'), g, 0, 0.4, 0.31);
        const gl = glowSprite('#ffd860', 1.4, 0.35); gl.position.y = 0.8; g.add(gl);
        g.rotation.y = -0.4;
      } else {
        const nm = modelsReady() && NPC_MODEL[id];
        if (nm && Assets.gltf[nm.m]) {
          const md = instModel(nm.m, 1.75, nm.tint);
          if (nm.r) showPart(md, nm.r); if (nm.l) showPart(md, nm.l); if (nm.hat) showPart(md, nm.hat); if (nm.cape) showPart(md, nm.cape);
          const r0 = group(null), in0 = group(r0); in0.add(md.obj);
          in0.rotation.y = Math.atan2(-(4 - d.pos[1]), 0 - d.pos[0]);
          ch = { root: r0, inner: in0, model: md, npcModel: true };
          playAnim(ch, nm.anim, { loop: true, speed: nm.loop ? 0.8 : 1 });
          md.mixer.update(Math.random() * 2);
        } else {
          ch = buildCharacter(d.L, d.wt, {});
          ch.inner.rotation.y = Math.atan2(-(4 - d.pos[1]), 0 - d.pos[0]);
        }
        g.add(ch.root);
      }
      // cenário de cada NPC
      if (id === 'mercador') {
        const st2 = group(g, -0.9, 0, -0.6);
        mk(G.box(1.6, 0.8, 0.8), M('#8a5a2a'), st2, 0, 0.4, 0);
        for (const x of [-0.75, 0.75]) mk(G.cyl(0.04, 0.04, 1.8, 6), M('#5a3a1a'), st2, x, 0.9, 0.35);
        const aw = mk(G.box(1.8, 0.05, 1.1), M('#d04a3a'), st2, 0, 1.8, 0.2); aw.rotation.x = 0.25;
        for (let i = 0; i < 4; i++) mk(G.sph(0.1, 8), M(['#e04040', '#4060e0', '#40c060', '#e0c040'][i], { e: ['#a01010', '#1030a0', '#108030', '#a08010'][i], ei: 0.5 }), st2, -0.5 + i * 0.33, 0.9, 0.1);
        st2.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      }
      if (id === 'ferreiro') {
        const an = group(g, 0.75, 0, 0.25);
        mk(G.box(0.25, 0.4, 0.25), M('#3a3a40'), an, 0, 0.2, 0);
        mk(G.box(0.6, 0.18, 0.3), M('#4a4a52', { m: 0.2, r: 0.4 }), an, 0, 0.48, 0);
        const forge = group(g, -0.6, 0, -0.9);
        mk(G.box(1, 0.9, 0.8), M('#5a4a44'), forge, 0, 0.45, 0);
        mk(G.box(0.6, 0.25, 0.1), M('#ff7020', { e: '#ff5010', ei: 2 }), forge, 0, 0.55, 0.41);
        const gl = glowSprite('#ff7020', 1.8, 0.7); gl.position.set(0, 0.6, 0.5); forge.add(gl);
        g.userData.anvil = new THREE.Vector3(d.pos[0] + 0.75, 0.6, d.pos[1] + 0.25);
      }
      if (id === 'portal') {
        const pr = group(g, 1.1, 1.3, -0.3);
        const ring = mk(G.torus(0.85, 0.09), M('#80c0ff', { e: '#4090ff', ei: 1.4 }), pr, 0, 0, 0, false);
        const disc = mk(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: '#6aa8ff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }), pr, 0, 0, 0, false);
        const gl = glowSprite('#70b0ff', 3, 0.5); pr.add(gl);
        pr.rotation.y = -0.5;
        g.userData.portal = { pr, ring, disc };
        mk(G.cyl(0.9, 1.0, 0.12, 20), M('#8a8aa0'), g, 1.1, 0.06, -0.3);
      }
      if (id === 'mestra') {
        const pd = group(g, -0.8, 0, -0.4);
        mk(G.cyl(0.18, 0.28, 0.9, 8), M('#8a7a6a'), pd, 0, 0.45, 0);
        const bk = mk(G.box(0.45, 0.06, 0.35), M('#7a3a6a'), pd, 0, 0.94, 0); bk.rotation.x = -0.3;
        const gl = glowSprite('#c090ff', 1, 0.6); gl.position.set(0, 1.1, 0); pd.add(gl);
        pd.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      }
      const hit = new THREE.Mesh(G.box(1.2, 2.2, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 1.1; hit.userData.npc = id; g.add(hit);
      g.traverse((o) => { if (o.isMesh && o !== hit && o.material && o.material.visible !== false && !(o.material.blending === THREE.AdditiveBlending)) o.castShadow = true; });
      npcs[id] = { g, ch, hit, id, pos: new THREE.Vector3(d.pos[0], 0, d.pos[1]) };
    }
    scene.add(root);
    env = { root, gtex, far: [], mid: [], props: [], scatter: [], ceil: [], th, stars: null, town: true, npcs, water, lamps, fountainZ: fz, gears, chimneys, crystals, FE };
    // rótulos
    const lab = document.getElementById('npc-labels');
    if (lab) lab.innerHTML = Object.keys(npcs).map((id) => `<div class="npc-label" id="lbl-${id}"><span>${NPC_ICON[id]}</span><b>${NPC_NAMES[id]}</b></div>`).join('');
  }

  function disposeEnv() {
    if (env) { scene.remove(env.root); env.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map && o.material.map !== GLOW) o.material.map.dispose(); o.material.dispose(); } }); }
    env = null;
    const lab = document.getElementById('npc-labels'); if (lab) lab.innerHTML = '';
  }

  function animTown(t, dt) {
    if (!env || !env.town) return;
    const n = env.npcs;
    for (const id in n) {
      const ch = n[id].ch; if (!ch) continue;
      if (ch.model) {
        ch.model.mixer.update(dt);
        if (id === 'ferreiro') { const ph = (ch.model.cur.time / ch.model.cur.getClip().duration); if (ph > 0.45 && ph < 0.6 && !n[id].hit2) { n[id].hit2 = true; const a = n[id].g.userData.anvil; for (let i = 0; i < 14; i++) spawnP({ x: a.x, y: a.y, z: a.z, vx: rand(-2, 2), vy: rand(1, 3.5), vz: rand(-2, 2), life: rand(0.3, 0.7), r: 1, gg: 0.6, b: 0.2, size: 0.07, g: -9 }); } if (ph < 0.3) n[id].hit2 = false; }
        continue;
      }
      ch.hips.position.y = 0.72 + Math.sin(t * 2 + id.length) * 0.012;
      ch.arms[0].rotation.z = 0.1 + Math.sin(t * 1.5 + id.length) * 0.08;
      if (id === 'ferreiro') {
        const ph = (t * 1.3) % 1;
        ch.arms[1].rotation.z = ph < 0.6 ? lerp(0.4, 2.8, ease(ph / 0.6)) : lerp(2.8, 0.6, (ph - 0.6) / 0.12);
        if (ph >= 0.72 && !n[id].hit2) { n[id].hit2 = true; const a = n[id].g.userData.anvil; for (let i = 0; i < 14; i++) spawnP({ x: a.x, y: a.y, z: a.z, vx: rand(-2, 2), vy: rand(1, 3.5), vz: rand(-2, 2), life: rand(0.3, 0.7), r: 1, gg: 0.6, b: 0.2, size: 0.07, g: -9 }); }
        if (ph < 0.5) n[id].hit2 = false;
      } else if (id === 'portal') {
        ch.arms[1].rotation.z = 1.6 + Math.sin(t * 2) * 0.15;
      } else ch.arms[1].rotation.z = 0.3 + Math.sin(t * 1.7) * 0.1;
    }
    const p = n.portal && n.portal.g.userData.portal;
    if (p) {
      p.ring.rotation.z += dt * 1.5; p.disc.material.opacity = 0.35 + Math.sin(t * 3) * 0.12;
      const wp = new THREE.Vector3(); p.pr.getWorldPosition(wp);
      if (Math.random() < 0.6) { const a = Math.random() * 6.28; spawnP({ x: wp.x + Math.cos(a) * 0.8, y: wp.y + Math.sin(a) * 0.8, z: wp.z, vx: -Math.cos(a) * 0.6, vy: -Math.sin(a) * 0.6, vz: 0, life: 1, r: 0.5, gg: 0.75, b: 1, size: 0.1 }); }
    }
    // fonte
    for (let i = 0; i < 3; i++) spawnP({ x: rand(-0.1, 0.1), y: 1.55, z: env.fountainZ + rand(-0.1, 0.1), vx: rand(-0.7, 0.7), vy: rand(1.5, 2.3), vz: rand(-0.7, 0.7), life: 0.8, r: env.FE ? 1 : 0.6, gg: env.FE ? 0.5 : 0.85, b: env.FE ? 0.15 : 1, size: 0.07, g: -5 });
    for (const g of env.gears) g.rotation.z += dt * (g.children.length > 12 ? 0.25 : -0.8);
    for (const c of env.chimneys) if (Math.random() < 0.25) spawnP({ x: c.x + rand(-0.1, 0.1), y: c.y, z: c.z, vx: rand(-0.1, 0.3), vy: rand(0.5, 0.9), vz: 0, life: 2.5, r: 0.35, gg: 0.33, b: 0.32, size: 0.35, fadeIn: true });
    for (const [i, c] of env.crystals.entries()) { c.position.y = 1.6 + Math.sin(t * 1.5 + i) * 0.15; c.rotation.y += dt * 0.8; }
    for (const l of env.lamps) l.material.opacity = 0.5 + Math.sin(t * 7 + l.position.x) * 0.05;
    // rótulos
    for (const id in n) {
      const el = document.getElementById('lbl-' + id); if (!el) continue;
      tmpV.copy(n[id].pos); tmpV.y = id === 'bau' ? 1.1 : 2.35;
      tmpV.project(camera);
      if (tmpV.z > 1) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = ((tmpV.x + 1) / 2 * W) + 'px'; el.style.top = ((1 - tmpV.y) / 2 * H) + 'px';
    }
  }

  function walkToNpc(id) {
    if (!running || !R.inTown || !st.hero || !env || !env.town || !env.npcs[id]) return false;
    const np = env.npcs[id].pos, h = st.hero.root.position;
    const dir = new THREE.Vector3(h.x - np.x, 0, h.z - np.z); const len = dir.length() || 1;
    dir.multiplyScalar(1 / len);
    const stop = id === 'bau' ? 0.9 : 1.15;
    const tx = np.x + dir.x * stop, tz = np.z + dir.z * stop;
    const pts = [];
    // contorna a fonte se o caminho passar por ela
    const fx = 0, fz = env.fountainZ, sx = tx - h.x, sz = tz - h.z, sl = Math.hypot(sx, sz) || 1;
    const u = clamp(((fx - h.x) * sx + (fz - h.z) * sz) / (sl * sl), 0, 1);
    const cx = h.x + sx * u - fx, cz = h.z + sz * u - fz;
    if (Math.hypot(cx, cz) < 1.6 && u > 0 && u < 1) {
      let px = -sz / sl, pz = sx / sl;
      if (px * (tx - fx) + pz * (tz - fz) < 0) { px = -px; pz = -pz; }
      pts.push({ x: fx + px * 2.0, z: fz + pz * 2.0 });
    }
    pts.push({ x: tx, z: tz });
    st.hero.walk = { pts, id };
    if (len <= stop + 0.15) { st.hero.walk = null; window.openNpc(id); }
    return true;
  }

  // ---------- câmera livre ----------
  const cam = { yaw: 0, pitch: 0, zoom: 1, ptrs: new Map(), drag: false, moved: 0, pinch: 0 };
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickNpc(cx, cy) {
    if (!env || !env.town) return null;
    const r = cv.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(Object.values(env.npcs).map((n) => n.hit), false);
    return hits.length ? hits[0].object.userData.npc : null;
  }
  function bindControls() {
    cv.addEventListener('pointerdown', (e) => {
      cam.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cam.moved = 0;
      if (cam.ptrs.size === 2) { const [a, b] = [...cam.ptrs.values()]; cam.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      if (e.pointerType === 'mouse') { cv.setPointerCapture(e.pointerId); cv.classList.add('dragging'); }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = cam.ptrs.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse' && env && env.town) cv.classList.toggle('hover-npc', !!pickNpc(e.clientX, e.clientY));
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      cam.moved += Math.abs(dx) + Math.abs(dy);
      if (cam.ptrs.size === 2) {
        const [a, b] = [...cam.ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (cam.pinch) cam.zoom = clamp(cam.zoom * cam.pinch / d, 0.55, 1.7);
        cam.pinch = d; return;
      }
      cam.yaw = env && env.world ? cam.yaw - dx * 0.008 : clamp(cam.yaw - dx * 0.008, -1.25, 1.25);
      if (e.pointerType === 'mouse') cam.pitch = clamp(cam.pitch + dy * 0.005, -0.15, 0.85);
    });
    const end = (e) => {
      const was = cam.ptrs.has(e.pointerId);
      cam.ptrs.delete(e.pointerId); cv.classList.remove('dragging');
      if (cam.ptrs.size < 2) cam.pinch = 0;
      if (was && cam.moved < 6 && e.type === 'pointerup') {
        const id = pickNpc(e.clientX, e.clientY);
        if (id) { walkToNpc(id); }
        else if (env && env.world) pickWorld(e.clientX, e.clientY);
      }
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !cam.ptrs.size) cv.classList.remove('hover-npc'); });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 1.08 : 0.93), 0.55, 1.7); }, { passive: false });
    cv.addEventListener('dblclick', () => { cam.yaw = 0; cam.pitch = 0; cam.zoom = 1; });
  }
  function updateCamera(t, dt) {
    const aspect = W / H, back = clamp(1.45 / aspect, 1, 1.9);
    const town = env && env.town;
    let target = town ? new THREE.Vector3(0, 1.0, -1.0) : new THREE.Vector3(0.2, 1.05, 0);
    if (window.__camFocusHero && st.hero) target = new THREE.Vector3(st.hero.root.position.x, 1.1, st.hero.root.position.z); // usado em testes
    if (env && env.world) {
      const hp = st.hero ? st.hero.root.position : new THREE.Vector3();
      const tg = new THREE.Vector3(hp.x, 0.8, hp.z);
      const dw = 10.5 * cam.zoom * (aspect < 0.8 ? 1.45 : aspect < 1.45 ? 1.15 : 1);
      const pw = clamp(0.82 + cam.pitch, 0.45, 1.35), yw = cam.yaw + 0.5;
      const skw = st.shake; st.shake = Math.max(0, st.shake - dt * 0.8);
      camera.position.set(tg.x + Math.sin(yw) * Math.cos(pw) * dw + (Math.random() - 0.5) * skw, tg.y + Math.sin(pw) * dw, tg.z + Math.cos(yw) * Math.cos(pw) * dw + (Math.random() - 0.5) * skw);
      camera.lookAt(tg);
      if (env.sun) { env.sun.position.set(hp.x + 7, 16, hp.z + 9); env.sun.target.position.set(hp.x, 0, hp.z); }
      return;
    }
    const dist = (town ? 10.5 : 7.6) * back * cam.zoom;
    const pitch = clamp((town ? 0.36 : 0.19) + cam.pitch, 0.03, 1.15);
    const yaw = cam.yaw + Math.sin(t * 0.25) * 0.03;
    const sk = st.shake; st.shake = Math.max(0, st.shake - dt * 0.8);
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist + (Math.random() - 0.5) * sk, target.y + Math.sin(pitch) * dist + (Math.random() - 0.5) * sk, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
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
        const hp1 = st.hero ? st.hero.root.position : { x: 0, z: 0 }, w0 = env && env.world;
        const p = { x: (w0 ? hp1.x : 0) + rand(-10, 12), y: rand(0.2, 5), z: (w0 ? hp1.z : 0) + rand(-8, 6), vx: 0, vy: 0, vz: 0, life: rand(2.5, 5), size: 0.08, scroll: !w0, fadeIn: true };
        let c = '#ffffff';
        if (a === 'snow') { p.y = 7; p.vy = -1.2; p.vx = -0.4; c = '#ffffff'; p.size = 0.09; }
        else if (a === 'ember') { p.y = 0; p.vy = rand(0.6, 1.6); c = '#ff7020'; p.size = 0.08; }
        else if (a === 'leaf') { p.y = 6; p.vy = -0.7; p.vx = -0.5; c = '#90c050'; p.size = 0.1; }
        else if (a === 'firefly') { p.vx = rand(-0.3, 0.3); p.vy = rand(-0.2, 0.2); c = '#d8ff70'; p.size = 0.12; }
        else if (a === 'wisp') { p.vx = rand(-0.2, 0.2); p.vy = 0.2; c = '#80a8ff'; p.size = 0.16; }
        else if (a === 'bubble') { p.y = 0.05; p.vy = 0.5; c = '#a0d0a0'; p.size = 0.07; }
        else if (a === 'sand') { p.vx = -3; p.x += 4; p.y = rand(0, 2.5); c = '#f0d8a0'; p.size = 0.05; }
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
  function pillar(x, z = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 9, 20, 1, true), fxMat('#ffe080', 0.6));
    m.position.set(x, 4.5, z);
    addFx({ obj: m, life: 1.4, upd: (f, p) => { m.material.opacity = 0.55 * (1 - p); m.scale.set(1 + p * 0.5, 1, 1 + p * 0.5); if (Math.random() < 0.7) spawnP({ x: x + rand(-0.6, 0.6), y: 0, z: z + rand(-0.6, 0.6), vx: 0, vy: rand(3, 6), vz: 0, life: 0.9, r: 1, gg: 0.85, b: 0.4, size: 0.12 }); }, dispose: true });
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
  function heroBaseX() { return RANGED[st.hero && st.hero.wt ? st.hero.wt : CLASSES[S.cls].weapon] ? -2.0 : -1.3; }
  function monBaseX(boss) { return boss ? 2.2 : 1.8; }
  function monCenter(e = st.mon) {
    if (!e) return null;
    const sc = e.boss ? 1.6 : (e.petScale || 1);
    const y = (e.P.float ? e.P.float + 0.1 : 0.75) * sc * (e.kind === 'golem' ? 1.3 : 1);
    return new THREE.Vector3(e.root.position.x, y, e.root.position.z);
  }
  function monTop(e = st.mon) { if (!e) return null; const c = monCenter(e); c.y += (e.boss ? 1.4 : 0.9); return c; }
  function entOf(sid) { return (sid && st.ents.get(sid)) || st.mon; }
  const SLOTS = [[0, 0], [0.95, -1.15], [1.05, 1.05], [1.95, -0.1]];
  function slotPos(i, boss) { const b = monBaseX(boss), o = SLOTS[i % 4]; return { x: b + o[0], z: o[1] }; }

  // ---------- eventos ----------
  function playerAttack(o) {
    if (!running || document.hidden || !st.hero) return;
    const t = now(), wt = st.hero.wt || CLASSES[S.cls].weapon, melee = !RANGED[wt];
    let dur = melee ? 0.45 : 0.55;
    if (st.hero.model) { dur = attackDur(); playAnim(st.hero, heroAttackClip(!!o.skill), { loop: false, dur: dur * (melee ? 1.15 : 1.1), fade: 0.06 }); }
    st.hero.atk = { start: t, dur, skill: !!o.skill };
    if (!st.mon) return;
    const color = o.stealth ? '#b070ff' : skillColor(o.skill ? (o.skillName || '') : '', wt);
    const hits = (o.hits && o.hits.length ? o.hits : [{ sid: st.mon.sid, text: o.text, cls: o.cls }]);
    const impact = (h) => {
      const e = entOf(h.sid); if (!e) return;
      e.hurt = now();
      if (e.model && !o.miss && !e.atk && now() >= (e.model.busyUntil || 0)) playAnim(e, Math.random() < 0.5 ? 'Hit_A' : 'Hit_B', { loop: false, dur: 0.35, fade: 0.05 });
      const c = monCenter(e);
      if (!o.miss) {
        burst(c, o.crit ? '#ffb040' : color, o.skill ? 26 : 14, o.skill ? 4.5 : 3);
        if (o.stealth) burst(c, '#5a2a9a', 30, 3.5, 0.18);
        if (o.crit || o.skill) st.shake = Math.max(st.shake, o.skill ? 0.16 : 0.1);
      }
      floatAt(monTop(e) || c, h.text, h.cls);
    };
    if (melee) {
      later(dur * 0.5, () => {
        const c = monCenter() || new THREE.Vector3(2, 1, 0);
        slash(new THREE.Vector3(c.x, c.y, c.z + 0.3), o.skill ? color : '#ffffff', o.skill);
        if (o.multi) for (let i = 1; i < Math.min(o.multi, 4); i++) later(i * 0.08, () => slash(new THREE.Vector3(c.x - 0.1, c.y + rand(-0.2, 0.3), c.z + 0.3), color, true));
        if (o.aoe) { ring(new THREE.Vector3(c.x, 0, c.z), color, 3.4, 0.5); for (const h of hits.slice(1)) { const e = entOf(h.sid); if (e) { const ce = monCenter(e); for (let k = 0; k < 6; k++) spawnP({ x: ce.x + rand(-0.3, 0.3), y: 0, z: ce.z + rand(-0.3, 0.3), vx: 0, vy: rand(3, 6), vz: 0, life: 0.5, r: 1, gg: 0.9, b: 0.6, size: 0.14 }); } } }
        else if (o.skill) ring(c, color, 1.8, 0.4);
        for (const h of hits) impact(h);
      });
      return;
    }
    const name = o.skillName || '';
    const sky = o.skill && /Meteoro|Chuva|Tormenta|Ira|Tempestade|Explosivas|Julgamento|Nova/i.test(name);
    const kind = wt === 'arco' ? 'arrow' : wt === 'dardo' ? 'dart' : 'orb';
    const hx = st.hero.root.position.x;
    hits.forEach((h, i) => {
      later(dur * 0.42 + i * 0.06, () => {
        const e = entOf(h.sid); if (!e) { impact(h); return; }
        const c = monCenter(e);
        const hp0 = st.hero.root.position, fa = R.face || 0; const from = sky ? new THREE.Vector3(c.x + rand(-1, 2), 7, c.z + rand(-0.5, 0.5)) : new THREE.Vector3(hp0.x + Math.cos(fa) * 0.5, wt === 'arco' ? 1.25 : 1.9, hp0.z + Math.sin(fa) * 0.5);
        projectile(kind, from, c.clone(), color, o.skill, sky ? 0.38 : 0.28, () => { impact(h); if (o.skill) ring(c, color, sky ? 2.4 : 1.6, 0.4); });
        if (sky && o.skill && i === 0) for (let k = 0; k < 4; k++) later(k * 0.05, () => { const f = new THREE.Vector3(c.x + rand(-1.5, 2.5), 7, rand(-1.5, 1.5)); const to = new THREE.Vector3(f.x - 1, 0.2, f.z); projectile(kind, f, to, color, true, 0.35, () => burst(to, color, 10, 2.5)); });
      });
    });
  }

  function monsterAttack(o) {
    if (!running || document.hidden || !st.hero) return;
    const e = entOf(o.sid); if (!e) return;
    e.atk = now();
    if (e.model) playAnim(e, e.mage ? 'Spellcast_Shoot' : (Math.random() < 0.5 ? '1H_Melee_Attack_Chop' : '1H_Melee_Attack_Slice_Diagonal'), { loop: false, dur: 0.6, fade: 0.06 });
    later(0.2, () => {
      if (o.toPet && st.pet) {
        st.pet.hurt = now();
        const pp = st.pet.root.position;
        burst(new THREE.Vector3(pp.x, 1, pp.z), '#ffa040', 8, 2.5, 0.1);
        floatAt(new THREE.Vector3(pp.x, 2.2, pp.z), o.text, 'pet');
        return;
      }
      const h = st.hero; if (!h) return;
      const p = new THREE.Vector3(h.root.position.x, 1.1, h.root.position.z);
      if (o.cls === 'block') { ring(new THREE.Vector3(p.x, 0, p.z), '#a0c8ff', 1, 0.3); burst(new THREE.Vector3(p.x, 1, p.z), '#c0e0ff', 10, 2.5, 0.08); }
      else if (o.cls !== 'miss') {
        if (h.model && !h.atk && now() >= (h.model.busyUntil || 0)) playAnim(h, 'Hit_A', { loop: false, dur: 0.4, fade: 0.05 });
        h.hurt = now(); burst(p, '#ff4040', 10, 2.5, 0.1); if (e.boss) st.shake = Math.max(st.shake, 0.12);
      }
      floatAt(new THREE.Vector3(h.root.position.x, 2.2, h.root.position.z), o.text, o.cls);
    });
  }

  function petAttack(o) {
    if (!running || document.hidden || !st.pet) return;
    const pt = st.pet; pt.atk = now();
    const e = entOf(o.sid); if (!e) return;
    const c = monCenter(e);
    const hitFx = () => { e.hurt = now(); burst(c, pt.petType === 'fera' ? '#ff8040' : '#a0e0ff', 12, 3); floatAt(monTop(e), o.text, o.cls); };
    if (pt.petType === 'fera') {
      const from = new THREE.Vector3(pt.root.position.x + 0.4, 1.6, pt.root.position.z);
      projectile('orb', from, c.clone(), '#ff7020', false, 0.3, hitFx);
    } else later(0.25, hitFx);
  }

  function float(target, text, cls) {
    if (!running || document.hidden) return;
    if (target === 'player' && st.hero) floatAt(new THREE.Vector3(st.hero.root.position.x, 2.2, st.hero.root.position.z), text, cls);
    else { const p = monTop(); if (p) floatAt(p, text, cls); }
  }
  function heal() {
    if (!running || document.hidden || !st.hero) return;
    const x = st.hero.root.position.x;
    const hz1 = st.hero.root.position.z; for (let i = 0; i < 24; i++) spawnP({ x: x + rand(-0.5, 0.5), y: rand(0, 1.6), z: hz1 + rand(-0.5, 0.5), vx: 0, vy: rand(1, 2), vz: 0, life: 1, r: 0.4, gg: 1, b: 0.5, size: 0.16 });
    ring(st.hero.root.position, '#70f080', 1.6, 0.6);
    if (st.hero.model && !st.hero.atk) playAnim(st.hero, 'Spellcast_Raise', { loop: false, dur: 0.7, fade: 0.08 });
  }
  function buff() {
    if (!running || document.hidden || !st.hero) return;
    const x = st.hero.root.position.x;
    ring(st.hero.root.position, '#ffd860', 2, 0.6);
    if (st.hero.model && !st.hero.atk) playAnim(st.hero, 'Spellcast_Raise', { loop: false, dur: 0.7, fade: 0.08 });
    const hz2 = st.hero.root.position.z; for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28; spawnP({ x: x + Math.cos(a) * 0.7, y: 0.1, z: hz2 + Math.sin(a) * 0.7, vx: 0, vy: rand(2, 4), vz: 0, life: 0.8, r: 1, gg: 0.85, b: 0.4, size: 0.12 }); }
  }
  function levelUp() {
    if (!running || document.hidden || !st.hero) return;
    pillar(st.hero.root.position.x, st.hero.root.position.z);
    if (st.hero.model && !st.mon) playAnim(st.hero, 'Cheer', { loop: false, dur: 1.2, fade: 0.1 });
    floatAt(new THREE.Vector3(st.hero.root.position.x, 2.8, st.hero.root.position.z), 'LEVEL UP!', 'lvl');
  }

  // ---------- sincronização ----------
  function disposeObj(o) { o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
  function sync(t) {
    const zk = R.inTown ? 'town' : S.zone;
    if (curZone !== zk) {
      curZone = zk;
      if (R.inTown) buildTown(); else buildWorld(zk);
      cam.yaw = 0; cam.pitch = 0;
      if (st.hero) { st.hero.walk = null; st.hero.root.position.set(R.inTown ? HERO_TOWN.x : (R.pos ? R.pos.x : 0), 0, R.inTown ? HERO_TOWN.z : (R.pos ? R.pos.z : 0)); st.hero.inner.rotation.y = R.inTown ? -1.25 : -0.45; }
      for (const d of st.dying) { scene.remove(d.root); disposeObj(d.root); }
      st.dying = [];
      for (const e of st.ents.values()) { scene.remove(e.root); disposeObj(e.root); }
      st.ents.clear(); st.mon = null;
      if (st.pet) { scene.remove(st.pet.root); disposeObj(st.pet.root); st.pet = null; }
    }
    const sig = equipSig();
    if (curCls !== sig) {
      const old = st.hero;
      curCls = sig; weaponKey = '';
      st.hero = buildHero(S.cls); scene.add(st.hero.root);
      if (old) { st.hero.root.position.copy(old.root.position); st.hero.inner.rotation.y = old.inner.rotation.y; st.hero.walk = old.walk; scene.remove(old.root); disposeObj(old.root); }
      else { st.hero.root.position.set(R.inTown ? HERO_TOWN.x : (R.pos ? R.pos.x : 0), 0, R.inTown ? HERO_TOWN.z : (R.pos ? R.pos.z : 0)); if (R.inTown) st.hero.inner.rotation.y = -1.25; }
    }
    updateWeaponLook();
    const live = R.inTown ? [] : (R.mons || []).filter((m) => m.hp > 0);
    const ids = new Set(live.map((m) => m.sid));
    for (const [sid, e] of st.ents) if (!ids.has(sid)) { killEnt(e, t); st.ents.delete(sid); }
    live.forEach((m, i) => {
      let e = st.ents.get(m.sid);
      if (!e) {
        e = buildMonster(m.name, m.boss); e.sid = m.sid;
        const sp = slotPos(i, m.boss);
        e.root.position.set(m.x != null ? m.x : sp.x, 0, m.z != null ? m.z : sp.z);
        e.root.userData.sid = m.sid;
        scene.add(e.root); st.ents.set(m.sid, e);
        if (m.x != null) burst(new THREE.Vector3(m.x, 0.4, m.z), '#c8b8ff', 12, 2, 0.12, 2);
        if (m.boss) { st.shake = Math.max(st.shake, 0.15); ring(new THREE.Vector3(m.x || 0, 0, m.z || 0), '#b060ff', 4, 0.9); }
      }
      e.ref = m; e.home = slotPos(i, m.boss);
    });
    st.mon = R.mon ? st.ents.get(R.mon.sid) || null : null;
    // invocação
    if (R.pet && (!st.pet || st.pet.sid !== R.pet.sid)) {
      if (st.pet) removePet();
      st.pet = buildPet(R.pet.kind); st.pet.sid = R.pet.sid; scene.add(st.pet.root);
    } else if (!R.pet && st.pet) removePet();
    const busy = st.dying.some((d) => t < d.dieAt + (d.model ? 0.9 : 0.35));
    st.run = !R.inTown && !(R.dead > 0) && !!R.moving;
  }

  function killEnt(dm, t) {
    const pending = st.timers.length ? Math.max(...st.timers.map((x) => x.at)) - t + 0.3 : 0;
    const hasProj = st.fx.some((f) => f.end && !f.ended);
    dm.dieAt = t + Math.max(0, pending) + (hasProj ? 0.3 : 0.05);
    if (dm.stars) dm.stars.visible = false;
    later(Math.max(0, dm.dieAt - t), () => {
      const c = new THREE.Vector3(dm.root.position.x, 0.8 * (dm.boss ? 1.6 : 1), dm.root.position.z);
      burst(c, dm.color, dm.boss ? 70 : 26, dm.boss ? 6 : 4, 0.16, 2);
      burst(c, '#ffffff', dm.boss ? 20 : 8, 3, 0.1, 2);
      if (dm.boss) { st.shake = 0.3; ring(c, '#ffd060', 5, 0.9); }
    });
    st.dying.push(dm);
  }

  function buildPet(kind) {
    const name = { golem: 'Colosso de Ferro', falcao: 'Grifo', fera: 'Dragão Branco' }[kind];
    const p = buildMonster(name, false);
    p.petType = kind;
    p.inner.rotation.y = Math.PI - 0.45; // olha para os monstros
    p.petScale = { golem: 0.85, falcao: 0.6, fera: 0.5 }[kind];
    p.root.scale.setScalar(p.petScale);
    const hx = st.hero ? st.hero.root.position.x : 0, hz0 = st.hero ? st.hero.root.position.z : 0;
    p.root.position.set(hx - 1.5, 0, hz0 - 1);
    ring(new THREE.Vector3(hx + 0.8, 0, hz0 - 0.9), kind === 'golem' ? '#80c0ff' : '#ffd860', 2, 0.6);
    burst(new THREE.Vector3(hx + 0.8, 1, hz0 - 0.9), kind === 'golem' ? '#a0d0ff' : '#ffe080', 30, 3);
    return p;
  }
  function removePet() {
    const p = st.pet; st.pet = null;
    const c = new THREE.Vector3(p.root.position.x, 1, p.root.position.z);
    burst(c, '#c0d8ff', 24, 3);
    scene.remove(p.root); disposeObj(p.root);
  }

  // posiciona o herói conforme a posição do jogo e vira para a direção certa
  function heroFollowWorld(h, dt) {
    const p = R.pos || { x: 0, z: 0 };
    h.root.position.x = lerp(h.root.position.x, p.x, Math.min(1, dt * 18));
    h.root.position.z = lerp(h.root.position.z, p.z, Math.min(1, dt * 18));
    const want = -(R.face || 0);
    let diff = want - h.inner.rotation.y; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    h.inner.rotation.y += diff * Math.min(1, dt * 12);
  }

  // ---------- animação do herói ----------
  function animHero(t, dt) {
    const h = st.hero, wt = h.wt, melee = !RANGED[wt];
    if (h.model && !R.inTown) return animHeroModel(t, dt);
    if (R.inTown) return animHeroTown(t, dt);
    const a = h.atk ? clamp((t - h.atk.start) / h.atk.dur, 0, 1) : 1;
    if (h.atk && a >= 1) h.atk = null;
    heroFollowWorld(h, dt);
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
    if (wt === 'arco' && h.weapon.userData.arrow) {
      const u = h.weapon.userData;
      u.arrow.visible = !!h.atk && a < 0.45;
      u.arrow.position.y = u.stringY + pull * 0.25; u.string.position.y = u.stringY + pull * 0.25;
    }
    if (h.weapon.userData.glow) { h.weapon.userData.glow.material.opacity = 0.5 + glow * 0.5 + Math.sin(t * 4) * 0.1; h.weapon.userData.glow.scale.setScalar(0.7 + glow * 0.6); }
    // dano
    setFlash(h.mats, t - h.hurt < 0.15 ? 0.9 : 0, '#ff6060');
    if (!(t - h.hurt < 0.15)) updateWeaponLook();
    if (h.cape) h.cape.rotation.z = (st.run ? 0.4 : 0.06) + Math.sin(t * 3) * 0.05 + (h.atk ? 0.15 : 0);
    // aura de buff
    const buffOn = R.buffs && R.buffs.length > 0;
    h.aura.material.opacity = lerp(h.aura.material.opacity, buffOn ? 0.55 + Math.sin(t * 4) * 0.15 : 0, Math.min(1, dt * 6));
    h.aura.rotation.z += dt; h.auraGlow.material.opacity = h.aura.material.opacity * 0.35;
  }

  function animHeroTown(t, dt) {
    const h = st.hero;
    let moving = false;
    if (h.walk) {
      const tg = h.walk.pts[0];
      const p = h.root.position, dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.06 && h.walk.pts.length > 1) h.walk.pts.shift();
      else if (d < 0.06) { const id = h.walk.id; h.walk = null; const np = env.npcs[id].pos; h.inner.rotation.y = Math.atan2(-(np.z - p.z), np.x - p.x); window.openNpc(id); }
      else {
        const sp = Math.min(d, 3.2 * dt); p.x += dx / d * sp; p.z += dz / d * sp; moving = true;
        const want = Math.atan2(-dz, dx);
        let diff = want - h.inner.rotation.y; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        h.inner.rotation.y += diff * Math.min(1, dt * 12);
      }
    }
    h.inner.rotation.z = 0; h.inner.position.set(0, 0, 0);
    if (h.model) return animHeroModel(t, dt);
    const ph = t * 11;
    h.hips.position.y = 0.72 + (moving ? Math.abs(Math.sin(ph)) * 0.07 : Math.sin(t * 2.5) * 0.012);
    h.torso.rotation.z = moving ? -0.12 : 0;
    const legA = moving ? Math.sin(ph) * 0.8 : 0;
    h.legs[0].rotation.z = legA; h.legs[1].rotation.z = -legA;
    h.arms[0].rotation.z = moving ? -Math.sin(ph) * 0.7 : 0.1 + Math.sin(t * 2.5) * 0.04;
    h.arms[1].rotation.z = moving ? Math.sin(ph) * 0.6 + 0.2 : 0.35 + Math.sin(t * 2.5) * 0.04;
    h.weapon.visible = true;
    if (h.weapon.userData.arrow) h.weapon.userData.arrow.visible = false;
    if (h.cape) h.cape.rotation.z = (moving ? 0.35 : 0.05) + Math.sin(t * 3) * 0.04;
    setFlash(h.mats, 0);
    h.aura.material.opacity = 0; h.auraGlow.material.opacity = 0;
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
    for (const m of st.ents.values()) {
      const rf = m.ref || {}, p = m.root.position;
      if (rf.x != null) { p.x = lerp(p.x, rf.x, Math.min(1, dt * 10)); p.z = lerp(p.z, rf.z, Math.min(1, dt * 10)); }
      if (rf.face != null) { const want = -rf.face + Math.PI; let df = want - m.inner.rotation.y; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2; m.inner.rotation.y += df * Math.min(1, dt * 8); }
      animMonster(m, t, dt);
      const atkA = m.atk ? clamp((t - m.atk) / 0.4, 0, 1) : 0;
      if (m.atk && atkA >= 1) m.atk = 0;
      { const k = Math.sin(atkA * Math.PI) * 0.6 - (t - m.hurt < 0.15 ? 0.1 : 0), f = (m.ref && m.ref.face) || 0; m.inner.position.x = Math.cos(f) * k; m.inner.position.z = Math.sin(f) * k; }
      const ref = m.ref || {};
      if (t - m.hurt < 0.07) setFlash(m.mats, 0.55);
      else if (ref.slow > 0) setFlash(m.mats, 0.45, '#4aa8ff');
      else setFlash(m.mats, 0);
      // estrelas de atordoamento
      if (ref.stun > 0) {
        if (!m.stars) { m.stars = group(m.root); for (let k = 0; k < 3; k++) { const sp = glowSprite('#ffe060', 0.35, 1); sp.userData.k = k; m.stars.add(sp); } }
        m.stars.visible = true;
        const hy = (m.P.float ? m.P.float + 0.9 : 1.9) / (m.boss ? 1 : 1);
        m.stars.children.forEach((sp) => { const a = t * 5 + sp.userData.k * 2.1; sp.position.set(Math.cos(a) * 0.35, hy, Math.sin(a) * 0.35); });
      } else if (m.stars) m.stars.visible = false;
    }
    // invocação
    if (st.pet) {
      const pt = st.pet, hx = st.hero ? st.hero.root.position.x : 0, hz = st.hero ? st.hero.root.position.z : 0;
      animMonster(pt, t, dt);
      const pa = pt.atk ? clamp((t - pt.atk) / 0.5, 0, 1) : 0;
      if (pt.atk && pa >= 1) pt.atk = 0;
      let tx = hx + 0.9, tz = hz - 0.95, ty = 0;
      if (pt.petType === 'falcao') { const a = t * 1.6; tx = hx + Math.cos(a) * 1.1; tz = hz + Math.sin(a) * 1.1; ty = 0.6; if (pa && st.mon) { const c = monCenter(); const k = Math.sin(pa * Math.PI); tx = lerp(tx, c.x, k); tz = lerp(tz, c.z, k); ty = lerp(ty, -0.6, k); } }
      else if (pt.petType === 'fera') { tx = hx - 0.6; tz = hz - 1.1; ty = 0.9 + Math.sin(t * 2) * 0.1; }
      else if (pa && st.mon) { const c = st.mon.root.position, k = Math.sin(pa * Math.PI) * 0.6; tx = lerp(tx, c.x, k); tz = lerp(tz, c.z, k); }
      pt.root.position.x = lerp(pt.root.position.x, tx, Math.min(1, dt * 6));
      pt.root.position.z = lerp(pt.root.position.z, tz, Math.min(1, dt * 6));
      pt.root.position.y = lerp(pt.root.position.y, ty, Math.min(1, dt * 6));
      if (pt.petType === 'falcao') pt.inner.rotation.y = Math.atan2(-(tz - pt.root.position.z), tx - pt.root.position.x) || pt.inner.rotation.y;
      setFlash(pt.mats, t - (pt.hurt || -9) < 0.12 ? 1 : 0, '#ffa040');
    }
    // furtividade
    if (st.hero) {
      const inv = R.stealth > 0;
      if (inv !== !!st.hero.invis) { st.hero.invis = inv; setOpacity(st.hero.mats, inv ? 0.3 : 1); if (!inv) for (const mt of st.hero.mats) mt.transparent = false; }
    }
    for (const d of st.dying) {
      animMonster(d, t, dt);
      if (st.run) d.root.position.x -= RUN_SPEED * dt;
      if (t > d.dieAt && d.model) {
        const p = clamp((t - d.dieAt - 0.8) / 0.6, 0, 1);
        if (p > 0 && !d.faded) { d.faded = true; setOpacity(d.mats, 1); }
        if (p > 0) setOpacity(d.mats, 1 - p);
        setFlash(d.mats, t - d.dieAt < 0.1 ? 1.5 : 0);
      } else if (t > d.dieAt) {
        const p = clamp((t - d.dieAt) / 0.7, 0, 1);
        if (!d.faded) { d.faded = true; setOpacity(d.mats, 1); }
        d.inner.rotation.z = -ease(p) * 1.4; d.inner.position.y = -p * 0.3;
        setOpacity(d.mats, 1 - p); setFlash(d.mats, p < 0.15 ? 1.5 : 0);
        d.root.scale.setScalar((d.boss ? 1.6 : 1) * (1 - p * 0.3));
      }
    }
    st.dying = st.dying.filter((d) => { const keep = t < d.dieAt + (d.model ? 1.45 : 0.8); if (!keep) { scene.remove(d.root); disposeObj(d.root); } return keep; });
    // efeitos
    for (const f of st.fx) {
      f.t += dt; const p = clamp(f.t / f.life, 0, 1);
      f.upd && f.upd(f, p);
      if (p >= 1 && f.end && !f.ended) { f.ended = true; f.end(); }
    }
    st.fx = st.fx.filter((f) => { const keep = f.t < f.life; if (!keep) { scene.remove(f.obj); if (f.dispose) disposeObj(f.obj); } return keep; });
    animTown(t, dt);
    updateWorldUI(t);
    ambient(dt);
    updateParticles(dt);
    if (env && env.stars) env.stars.material.opacity = 0.7 + Math.sin(t * 2) * 0.2;
    updateCamera(t, dt);
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
      loadAssets();
      bindControls();
    }
    // reinicia o estado visual
    if (st.hero) { scene.remove(st.hero.root); disposeObj(st.hero.root); }
    for (const e of st.ents.values()) { scene.remove(e.root); disposeObj(e.root); }
    st.ents.clear();
    if (st.pet) { scene.remove(st.pet.root); disposeObj(st.pet.root); st.pet = null; }
    for (const d of st.dying) { scene.remove(d.root); disposeObj(d.root); }
    for (const f of st.fx) scene.remove(f.obj);
    st.hero = null; st.mon = null; st.dying = []; st.fx = []; st.timers = []; parts.length = 0;
    curZone = null; curCls = null;
    cam.yaw = 0; cam.pitch = 0; cam.zoom = 1;
    if (ro) { ro.disconnect(); ro.observe(cv); }
    resize();
    if (!running) { running = true; lastT = 0; raf = requestAnimationFrame(frame); }
  }
  function stop() { running = false; cancelAnimationFrame(raf); if (layer) layer.innerHTML = ''; for (const el of barEls.values()) el.remove(); barEls.clear(); const lab = document.getElementById('npc-labels'); if (lab) lab.innerHTML = ''; }

  return { ok: true, start, stop, resize, playerAttack, monsterAttack, petAttack, float, heal, buff, levelUp, walkToNpc, _st: st };
})();

// ---------- fachada: escolhe 3D ou 2D ----------
const Scene = (() => {
  let impl = null;
  const pick = () => ((typeof S !== 'undefined' && S && S.settings && S.settings.gfx === '2d') || !Scene3D.ok ? Scene2D : Scene3D);
  const fwd = (k) => (...a) => impl && impl[k] && impl[k](...a);
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
    petAttack: fwd('petAttack'), float: fwd('float'), heal: fwd('heal'), buff: fwd('buff'), levelUp: fwd('levelUp'),
    is3D: () => impl === Scene3D,
    walkToNpc: (id) => impl === Scene3D && Scene3D.walkToNpc(id),
  };
})();
