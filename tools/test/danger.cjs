const { chromium } = require('playwright');
// Calibra a área perigosa (Fenda Primordial): herói médio do 88 sozinho, médio com equipe de 3 e herói muito forte (Conta Full), 5 min cada.
// Uso: node tools/test/danger.cjs ['{"hp":4,"atk":19}']  (sem argumento usa os valores do jogo)
const startServer = require('./server.cjs');
(async () => {
  const srv = await startServer(); const b = await chromium.launch(); const p = await b.newPage();
  await p.goto(srv.url + '/index.html');
  const out = await p.evaluate((dg) => {
    const res = []; Object.assign(DANGER, dg);
    const medio = (cls) => { localStorage.clear(); slot = 0; S = newCharacter('M', cls); S.lvl = 88; S.pts = 87 * 5; autoDistribute(); S.tut = 99; S.settings.gfx = '2d';
      for (const sl of SLOT_ORDER) { let it; for (let k = 0; k < 50; k++) { it = sl === 'arma' ? genItem(88, 3, 'arma') : genItem(88, 3, sl); if (it.rarity === 'raro' || it.rarity === 'epico') break; } if (sl === 'arma') it.wtype = CLASSES[cls].weapon; it.refine = 5; it.req = 1; S.equip[sl] = it; }
      S.pots = { hp1: 0, hp2: 10, mp1: 0, mp2: 10 }; S.gold = 0; };
    const run = (label, team) => {
      save(); startGame(0); stopLoop(); Scene.stop(); $('#modal').classList.add('hidden'); R.storyQ = []; S.story = { ch: STORY.length, prog: 0, seen: 99 };
      S.settings.auto = true; S.settings.autoTravel = false; S.zone = 'e1'; initWorld();
      window.partyNear = () => team; const d0 = S.stats.deaths, k0 = S.stats.kills;
      let mn = 1, pot0 = (S.pots.hp1||0)+(S.pots.hp2||0); for (let i = 0; i < 3000; i++) { tick(); mn = Math.min(mn, S.hp / derived().maxHp); }
      res.push(`${label.padEnd(30)} mortes ${S.stats.deaths - d0}  abates ${S.stats.kills - k0} vidaMin ${Math.round(mn*100)}% poções ${pot0 - (S.pots.hp1||0) - (S.pots.hp2||0)} | vida ${derived().maxHp} def ${derived().def} monAtk ${R.mons[0] && R.mons[0].atk} danger ${R.mons.filter(m=>m.danger).length} zona ${S.zone}`);
    };
    for (const cls of ['gladiador', 'arcanista', 'cleriga']) { medio(cls); run(cls + ' médio solo', 0); medio(cls); run(cls + ' médio + equipe 3', 2); }
    for (const cls of ['gladiador', 'arcanista', 'cleriga']) { localStorage.clear(); slot = 0; S = makeFullChar('F', cls); S.tut = 99; S.settings.gfx = '2d'; run(cls + ' muito forte solo', 0); }
    return res.join('\n');
  }, JSON.parse(process.argv[2] || '{}'));
  console.log(out); await b.close(); srv.close();
})();
