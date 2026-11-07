// Calibra a área perigosa (Fenda Primordial), 5 min de jogo em cada caso:
//  médio sozinho com poções (não deve morrer, mas gasta poção) · médio sozinho sem poções (morre) ·
//  médio em equipe com tanque e cura, sem poções (difícil morrer) · muito forte sozinho (Conta Full, tranquilo)
// Uso: node tools/test/danger.cjs ['{"hp":3,"atk":8}']   (sem argumento usa os valores do jogo)
const { chromium } = require('playwright');
const startServer = require('./server.cjs');
(async () => {
  const srv = await startServer(); const b = await chromium.launch(); const p = await b.newPage();
  await p.goto(srv.url + '/index.html');
  const out = await p.evaluate((dg) => {
    const res = []; Object.assign(DANGER, dg);
    const medio = (cls, pots) => { localStorage.clear(); slot = 0; S = newCharacter('M', cls); S.lvl = 88; S.pts = 87 * 5; autoDistribute(); S.tut = 99; S.settings.gfx = '2d';
      for (const sl of SLOT_ORDER) { let it; for (let k = 0; k < 50; k++) { it = genItem(88, 3, sl); if (it.rarity === 'raro' || it.rarity === 'epico') break; } if (sl === 'arma') it.wtype = CLASSES[cls].weapon; it.refine = 5; it.req = 1; S.equip[sl] = it; }
      S.pots = pots ? { hp1: 0, hp2: 30, mp1: 0, mp2: 30 } : { hp1: 0, hp2: 0, mp1: 0, mp2: 0 }; S.gold = pots ? 200000 : 0; S.settings.autoBuyPots = !!pots; };
    const run = (label, team) => {
      save(); startGame(0); stopLoop(); Scene.stop(); $('#modal').classList.add('hidden'); R.storyQ = []; S.story = { ch: STORY.length, prog: 0, seen: 99 };
      if (!S.pots.hp2 && !S.pots.hp1) S.settings.autoBuyPots = false;
      S.settings.auto = true; S.settings.autoTravel = false; S.zone = 'e1'; initWorld();
      window.partyMembersNear = () => team; const d0 = S.stats.deaths, k0 = S.stats.kills, p0 = (S.pots.hp1 || 0) + (S.pots.hp2 || 0) + (S.gold / 20 | 0);
      let mn = 1; for (let i = 0; i < 3000; i++) { tick(); mn = Math.min(mn, S.hp / derived().maxHp); }
      res.push(`${label.padEnd(34)} mortes ${S.stats.deaths - d0}  abates ${S.stats.kills - k0}  vida mínima ${Math.round(mn * 100)}%`);
    };
    const equipe = [{ cls: 'paladino', name: 'T' }, { cls: 'cleriga', name: 'C' }];
    for (const cls of ['gladiador', 'arcanista', 'cleriga']) {
      medio(cls, true); run(cls + ' médio sozinho com poções', []);
      medio(cls, false); run(cls + ' médio sozinho sem poções', []);
      medio(cls, false); run(cls + ' médio em equipe, sem poções', equipe);
    }
    for (const cls of ['gladiador', 'arcanista', 'cleriga']) { localStorage.clear(); slot = 0; S = makeFullChar('F', cls); S.tut = 99; S.settings.gfx = '2d'; run(cls + ' muito forte sozinho', []); }
    return res.join('\n');
  }, JSON.parse(process.argv[2] || '{}'));
  console.log(out); await b.close(); srv.close();
})();
