// ============================================================
//  Crônicas de Valdária — áudio procedural (Web Audio API)
//  Efeitos sonoros e música gerados em tempo real, sem arquivos.
// ============================================================

const Sfx = (() => {
  let ac = null, master, sfxBus, musBus, noiseBuf = null, comp;
  const last = {};
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const set = () => (typeof S !== 'undefined' && S && S.settings) || { sfxVol: 70, musVol: 45, muted: false };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    musBus = ac.createGain(); musBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolume();
    setInterval(schedule, 100);
  }
  function applyVolume() {
    if (!ac) return;
    const s = set();
    const m = s.muted ? 0 : 1;
    master.gain.setTargetAtTime(m, ac.currentTime, 0.05);
    sfxBus.gain.setTargetAtTime(((s.sfxVol ?? 70) / 100) * 0.9, ac.currentTime, 0.05);
    musBus.gain.setTargetAtTime(((s.musVol ?? 45) / 100) * 0.55, ac.currentTime, 0.05);
  }

  // ---------- primitivas ----------
  function tone(f, dur, o = {}) {
    const t = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const v = o.vol ?? 0.3, a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (o.filter) { const fl = ac.createBiquadFilter(); fl.type = o.filter; fl.frequency.value = o.ff || 1200; g.connect(fl); node = fl; }
    osc.connect(g); node.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(dur, o = {}) {
    const t = ac.currentTime + (o.delay || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = o.filter || 'bandpass'; fl.frequency.setValueAtTime(o.ff || 1500, t);
    if (o.fto) fl.frequency.exponentialRampToValueAtTime(o.fto, t + dur);
    fl.Q.value = o.q || 1;
    const g = ac.createGain(), v = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + (o.attack || 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(o.bus || sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  // ---------- efeitos ----------
  const SOUNDS = {
    click: () => tone(900, 0.06, { type: 'triangle', vol: 0.12 }),
    slash: (o) => { noise(0.18, { ff: 2500, fto: 600, q: 0.8, vol: 0.35, delay: o.delay }); },
    hit: (o) => { noise(0.08, { ff: 900, q: 1.2, vol: 0.4, delay: o.delay }); tone(140, 0.12, { to: 60, type: 'square', vol: 0.12, filter: 'lowpass', ff: 700, delay: o.delay }); },
    crit: (o) => { noise(0.14, { ff: 1400, q: 0.8, vol: 0.5, delay: o.delay }); tone(220, 0.25, { to: 50, type: 'sawtooth', vol: 0.2, filter: 'lowpass', ff: 1000, delay: o.delay }); tone(1200, 0.15, { type: 'triangle', vol: 0.1, delay: o.delay }); },
    bow: () => { tone(320, 0.14, { to: 180, type: 'triangle', vol: 0.2 }); noise(0.15, { ff: 3000, fto: 1200, q: 2, vol: 0.12, delay: 0.02 }); },
    throw: () => noise(0.22, { ff: 1800, fto: 500, q: 1.5, vol: 0.25 }),
    magic: (o) => { tone(500, 0.35, { to: 1300, type: 'sine', vol: 0.15 }); tone(750, 0.35, { to: 1900, type: 'triangle', vol: 0.06, detune: 8 }); if (o.fire) noise(0.4, { ff: 600, fto: 2000, q: 0.5, vol: 0.15 }); },
    boom: (o) => { tone(90, 0.5, { to: 30, type: 'sine', vol: 0.45, delay: o.delay }); noise(0.45, { filter: 'lowpass', ff: 1200, fto: 200, vol: 0.4, delay: o.delay }); },
    holy: (o) => { [0, 4, 7, 12].forEach((n, i) => tone(midi(76 + n), 0.5, { type: 'sine', vol: 0.08, delay: (o.delay || 0) + i * 0.03 })); },
    hurt: () => { tone(180, 0.15, { to: 90, type: 'square', vol: 0.1, filter: 'lowpass', ff: 900 }); noise(0.1, { ff: 500, vol: 0.25 }); },
    whiff: () => noise(0.15, { ff: 1200, fto: 3000, q: 3, vol: 0.12 }),
    kill: () => { tone(300, 0.2, { to: 80, type: 'sawtooth', vol: 0.12, filter: 'lowpass', ff: 1200 }); noise(0.25, { filter: 'lowpass', ff: 1500, fto: 300, vol: 0.2 }); },
    coin: () => { tone(1568, 0.09, { type: 'square', vol: 0.06, filter: 'lowpass', ff: 4000 }); tone(2093, 0.18, { type: 'square', vol: 0.06, filter: 'lowpass', ff: 4000, delay: 0.07 }); },
    loot: (o) => { const r = o.rarity || 0; const base = 72 + r * 2; [0, 4, 7, 12, 16].slice(0, 2 + r).forEach((n, i) => tone(midi(base + n), 0.35 + r * 0.1, { type: 'triangle', vol: 0.1 + r * 0.02, delay: i * 0.06 })); },
    levelup: () => { [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.6, { type: 'triangle', vol: 0.13, delay: i * 0.07 })); tone(midi(48), 1.2, { type: 'sine', vol: 0.2, delay: 0.1 }); },
    heal: () => { [0, 5, 9, 12].forEach((n, i) => tone(midi(79 + n), 0.4, { type: 'sine', vol: 0.08, delay: i * 0.05 })); },
    buff: () => { tone(400, 0.5, { to: 800, type: 'triangle', vol: 0.1 }); tone(600, 0.5, { to: 1200, type: 'sine', vol: 0.06, delay: 0.05 }); },
    potion: () => { tone(500, 0.08, { to: 900, type: 'sine', vol: 0.12 }); tone(700, 0.1, { to: 1200, type: 'sine', vol: 0.1, delay: 0.08 }); },
    death: () => { [67, 63, 60, 55].forEach((n, i) => tone(midi(n), 0.6, { type: 'triangle', vol: 0.14, delay: i * 0.18 })); },
    boss: () => { tone(55, 1.4, { to: 40, type: 'sawtooth', vol: 0.25, filter: 'lowpass', ff: 400 }); noise(1.0, { filter: 'lowpass', ff: 300, vol: 0.3 }); tone(110, 1.2, { type: 'square', vol: 0.06, filter: 'lowpass', ff: 600, delay: 0.3 }); },
    refineOk: () => { tone(1200, 0.08, { type: 'square', vol: 0.08, filter: 'lowpass', ff: 3000 }); [72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.4, { type: 'triangle', vol: 0.11, delay: 0.1 + i * 0.07 })); },
    refineFail: () => { tone(800, 0.08, { type: 'square', vol: 0.08 }); noise(0.3, { ff: 3000, q: 0.5, vol: 0.2, delay: 0.05 }); tone(200, 0.4, { to: 90, type: 'sawtooth', vol: 0.12, filter: 'lowpass', ff: 800, delay: 0.1 }); },
    portal: () => { tone(200, 0.8, { to: 900, type: 'sine', vol: 0.15 }); tone(300, 0.8, { to: 1300, type: 'triangle', vol: 0.07, detune: 12 }); noise(0.8, { ff: 400, fto: 3000, q: 2, vol: 0.1 }); },
    open: () => { tone(660, 0.1, { type: 'triangle', vol: 0.1 }); tone(990, 0.15, { type: 'triangle', vol: 0.08, delay: 0.06 }); },
  };
  function play(name, o = {}) {
    if (!ac || document.hidden) return;
    const s = set(); if (s.muted) return;
    const t = performance.now();
    if (last[name] && t - last[name] < (o.gap ?? 45)) return;
    last[name] = t;
    try { SOUNDS[name] && SOUNDS[name](o); } catch (e) { /* ignora */ }
  }

  // ---------- música procedural ----------
  // acordes em semitons relativos à tônica
  const TRACKS = {
    town:  { root: 60, bpm: 78, chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], arp: 'triangle', bell: true },
    z1:    { root: 62, bpm: 92, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]], arp: 'triangle' },
    z2:    { root: 57, bpm: 88, chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], arp: 'triangle' },
    z3:    { root: 55, bpm: 76, chords: [[0, 3, 7], [5, 9, 12], [0, 3, 7], [10, 14, 17]], arp: 'sine' },
    z4:    { root: 52, bpm: 70, chords: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]], arp: 'sine', drums: 1 },
    z5:    { root: 57, bpm: 96, chords: [[0, 4, 7], [1, 5, 8], [0, 4, 7], [-2, 1, 5]], arp: 'sawtooth', drums: 1 },
    z6:    { root: 50, bpm: 66, chords: [[0, 3, 7], [6, 9, 13], [5, 8, 12], [1, 5, 8]], arp: 'sine' },
    z7:    { root: 59, bpm: 80, chords: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 10, 14]], arp: 'triangle', bell: true },
    z8:    { root: 52, bpm: 118, chords: [[0, 3, 7], [8, 12, 15], [11, 14, 17], [7, 11, 14]], arp: 'sawtooth', drums: 2 },
    z9:    { root: 55, bpm: 100, chords: [[0, 4, 7], [10, 14, 17], [5, 9, 12], [0, 4, 7]], arp: 'square', drums: 1 },
    z10:   { root: 49, bpm: 72, chords: [[0, 3, 6], [1, 4, 8], [0, 3, 7], [-1, 3, 6]], arp: 'sine', bell: true },
    boss:  { root: 50, bpm: 132, chords: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [6, 10, 13]], arp: 'sawtooth', drums: 2 },
  };
  let cur = null, want = null, nextBar = 0, bar = 0, trackGain = null;

  function music(key) {
    want = TRACKS[key] ? key : 'z1';
  }
  function kick(t, g) { const o = ac.createOscillator(), v = ac.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); v.gain.setValueAtTime(0.5, t); v.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(v); v.connect(g); o.start(t); o.stop(t + 0.3); }
  function hat(t, g, vol = 0.05, len = 0.04) { const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const v = ac.createGain(); v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.001, t + len); s.connect(f); f.connect(v); v.connect(g); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02); }
  function snare(t, g) { const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; const v = ac.createGain(); v.gain.setValueAtTime(0.18, t); v.gain.exponentialRampToValueAtTime(0.001, t + 0.18); s.connect(f); f.connect(v); v.connect(g); s.start(t, Math.random() * 0.5); s.stop(t + 0.2); }
  function note(t, f, dur, type, vol, g, attack = 0.01, filt = 2200) {
    const o = ac.createOscillator(), v = ac.createGain(), fl = ac.createBiquadFilter();
    o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = filt;
    v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(vol, t + attack); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(v); v.connect(g); o.start(t); o.stop(t + dur + 0.05);
  }
  function scheduleBar(tr, t, g) {
    const beat = 60 / tr.bpm, ch = tr.chords[bar % tr.chords.length];
    const r = tr.root;
    // pad
    for (const n of ch) { note(t, midi(r + n), beat * 4.2, 'sine', 0.05, g, beat * 0.8, 1400); note(t, midi(r + n + 12), beat * 4.2, 'triangle', 0.015, g, beat, 1800); }
    // baixo
    note(t, midi(r + ch[0] - 12), beat * 1.8, 'triangle', 0.12, g, 0.02, 600);
    note(t + beat * 2, midi(r + ch[0] - 12), beat * 1.8, 'triangle', 0.1, g, 0.02, 600);
    // arpejo
    const pat = [0, 1, 2, 1, 0, 2, 1, 2];
    for (let i = 0; i < 8; i++) {
      if (tr.drums !== 2 && Math.random() < 0.15) continue;
      const n = ch[pat[i]] + (i >= 4 && bar % 2 ? 12 : 0) + 12;
      note(t + i * beat / 2, midi(r + n), beat * 0.6, tr.arp, tr.arp === 'sawtooth' || tr.arp === 'square' ? 0.025 : 0.05, g, 0.005, tr.arp === 'sawtooth' ? 1600 : 2600);
    }
    if (tr.bell && bar % 2 === 0) note(t + beat * 3, midi(r + ch[2] + 24), beat * 2.5, 'sine', 0.035, g, 0.005, 5000);
    if (tr.drums) {
      for (let i = 0; i < 4; i++) {
        if (i % 2 === 0) kick(t + i * beat, g);
        if (tr.drums === 2 && i % 2 === 1) snare(t + i * beat, g);
        hat(t + i * beat + beat / 2, g);
        if (tr.drums === 2) hat(t + i * beat, g, 0.03);
      }
    }
  }
  function schedule() {
    if (!ac || document.hidden) return;
    const s = set();
    if (s.muted || (s.musVol ?? 45) <= 0) { cur = null; return; }
    if (want !== cur) {
      if (trackGain) { const old = trackGain; old.gain.setTargetAtTime(0, ac.currentTime, 0.5); setTimeout(() => old.disconnect(), 3000); }
      cur = want; bar = 0;
      if (!cur) return;
      trackGain = ac.createGain(); trackGain.gain.setValueAtTime(0, ac.currentTime); trackGain.gain.setTargetAtTime(1, ac.currentTime + 0.2, 0.6);
      trackGain.connect(musBus);
      nextBar = ac.currentTime + 0.25;
    }
    if (!cur) return;
    const tr = TRACKS[cur];
    while (nextBar < ac.currentTime + 0.4) {
      scheduleBar(tr, nextBar, trackGain);
      nextBar += (60 / tr.bpm) * 4; bar++;
    }
  }

  // inicia na primeira interação (exigência dos navegadores)
  const unlock = () => { init(); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  return { play, music, applyVolume, init };
})();
