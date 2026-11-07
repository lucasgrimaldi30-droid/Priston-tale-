// Simulação de balanceamento: o herói joga sozinho (modo Auto, missões automáticas,
// equipa melhorias, vende lixo, refina a arma e vai para o melhor mapa do nível).
// Uso: node tools/test/balance.cjs [horas=24] [classe1,classe2,...]
// Alvo atual: nível ~44–55 em 24 h, poucas mortes, nenhuma classe muito à frente.
const { chromium } = require('playwright');
const startServer = require('./server.cjs');
const HOURS = +process.argv[2] || 24;
const CLASSES = (process.argv[3] || 'gladiador,engenheiro,lanceiro,cacadora,paladino,valquiria,arcanista,cleriga').split(',');

(async () => {
  const srv = await startServer();
  const b = await chromium.launch();
  const marks = [2, 6, 12, 24, 48, 72].filter((h) => h <= HOURS);
  if (!marks.includes(HOURS)) marks.push(HOURS);
  console.log(`Simulando ${HOURS} h por classe (marcos: ${marks.join(', ')} h)\n`);
  for (const cls of CLASSES) {
    const p = await b.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(srv.url + '/index.html');
    await p.evaluate((cls) => { localStorage.clear(); slot = 0; S = newCharacter('Sim', cls); S.settings.autoPts = true; S.settings.autoBoss = true; S.settings.gfx = '2d'; save(); startGame(0); stopLoop(); Scene.stop(); }, cls);
    const out = await p.evaluate(([hours, marks]) => {
      const res = [];
      for (let h = 1; h <= hours; h++) {
        for (let i = 0; i < 36000; i++) {
          tick();
          if (i % 600 === 0) {
            for (const it of [...S.inv]) if (isUpgrade(it)) { R.sel = it.uid; equipItem(it.uid); }
            sellUpTo(2);
            const z = ZONES.filter((z) => z.min <= S.lvl).pop();
            if (z.id !== S.zone) { S.zone = z.id; R.worldZone = null; R.mon = null; }
            if (S.stones > 3 && S.equip.arma) { R.refSel = S.equip.arma.uid; doRefine(); }
          }
        }
        if (marks.includes(h)) res.push(`${h}h: nv ${S.lvl} ${S.zone} mortes ${S.stats.deaths}`);
      }
      return res;
    }, [HOURS, marks]);
    console.log(cls.padEnd(11), out.join(' | '), errs.length ? '❌ ' + errs[0] : '');
    await p.close();
  }
  await b.close(); srv.close();
})();
