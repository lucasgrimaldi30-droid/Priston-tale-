// Calibra a dificuldade dos renascidos (5 min de jogo em cada caso):
//  herói médio nível 100 ★1/★2/★3 no Vale da Fênix em cada dificuldade liberada (com e sem poção), herói Full ★3 no Lendário, e um renascido no meio da subida (nível 50, mapa normal)
// Uso: node tools/test/rebirth.cjs ['{"t":{"atk":0.25},"h":{"hp":2},"l":{"atk":3}}']  (sem argumento usa os valores do jogo)
const { chromium } = require('playwright');
const startServer = require('./server.cjs');
(async () => {
  const srv = await startServer(); const b = await chromium.launch(); const p = await b.newPage();
  await p.goto(srv.url + '/index.html');
  const out = await p.evaluate((cfg) => {
    const res = []; Object.assign(RB_THREAT, cfg.t || {}); if (cfg.h) Object.assign(RB_DIFF[2], cfg.h); if (cfg.l) Object.assign(RB_DIFF[3], cfg.l);
    const run = (label, zone, diff) => {
      save(); startGame(0); stopLoop(); Scene.stop(); $('#modal').classList.add('hidden'); R.storyQ = []; S.story = { ch: STORY.length, prog: 0, seen: 99 };
      S.settings.auto = true; S.settings.autoTravel = false; S.rbDiff = diff; S.zone = zone; initWorld();
      window.partyMembersNear = () => []; const d0 = S.stats.deaths, k0 = S.stats.kills, f0 = S.feathers || 0, x0 = S.stats.goldEarned;
      let mn = 1; for (let i = 0; i < 3000; i++) { tick(); mn = Math.min(mn, S.hp / derived().maxHp); }
      res.push(`${label.padEnd(40)} mortes ${S.stats.deaths - d0}  abates ${String(S.stats.kills - k0).padStart(3)}  penas ${String((S.feathers || 0) - f0).padStart(3)}  vida mín ${Math.round(mn * 100)}%`);
    };
    const medio = (cls, rb, pots) => { localStorage.clear(); slot = 0; S = newCharacter('M', cls); S.lvl = 100; S.pts = 99 * 5; autoDistribute(); S.tut = 99; S.settings.gfx = '2d'; S.rebirths = rb;
      for (const sl of SLOT_ORDER) { let it; for (let k = 0; k < 50; k++) { it = genItem(100, 3, sl); if (it.rarity === 'raro' || it.rarity === 'epico') break; } if (sl === 'arma') it.wtype = CLASSES[cls].weapon; it.refine = 5; it.req = 1; S.equip[sl] = it; }
      S.pots = pots ? { hp1: 0, hp2: 30, mp1: 0, mp2: 30 } : { hp1: 0, hp2: 0, mp1: 0, mp2: 0 }; S.gold = pots ? 300000 : 0; S.settings.autoBuyPots = !!pots; };
    for (const cls of ['gladiador', 'arcanista', 'cleriga']) for (const rb of [1, 2, 3]) for (let d = 1; d <= rb; d++) for (const pots of [true, false]) {
      medio(cls, rb, pots); run(`${cls} médio ★${rb} ${RB_DIFF[d].n} ${pots ? 'c/ poção' : 's/ poção'}`, 'rb', d);
    }
    for (const cls of ['gladiador', 'arcanista', 'cleriga']) { localStorage.clear(); slot = 0; S = makeFullChar('F', cls); S.rebirths = 3; S.tut = 99; S.settings.gfx = '2d'; run(`${cls} Full ★3 Lendário`, 'rb', 3); }
    // renascido subindo de novo: nível 50 com os itens de antes (nível 100, inativos acima do nível) — usa itens do nível 50
    for (const cls of ['gladiador', 'arcanista', 'cleriga']) for (const rb of [0, 1, 3]) {
      localStorage.clear(); slot = 0; S = newCharacter('M', cls); S.lvl = 50; S.pts = 49 * 5; autoDistribute(); S.tut = 99; S.settings.gfx = '2d'; S.rebirths = rb;
      for (const sl of SLOT_ORDER) { let it; for (let k = 0; k < 50; k++) { it = genItem(50, 3, sl); if (it.rarity === 'raro') break; } if (sl === 'arma') it.wtype = CLASSES[cls].weapon; it.refine = 4; it.req = 1; S.equip[sl] = it; }
      S.pots = { hp1: 0, hp2: 20, mp1: 0, mp2: 20 }; S.gold = 50000; S.settings.autoBuyPots = true;
      const z = ZONES.find((z) => z.min <= 50 && z.min + zoneSpan(z) >= 50) || ZONES[5];
      run(`${cls} ★${rb} nível 50 (${z.id})`, z.id, 1);
    }
    return res.join('\n');
  }, JSON.parse(process.argv[2] || '{}'));
  console.log(out); await b.close(); srv.close();
})();
