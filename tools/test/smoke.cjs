// Teste completo no navegador: 8 classes no mundo aberto, cidade, janelas, Conta Full
// dentro de iframe com sandbox (igual à página publicada) e tela de celular.
// Uso: node tools/test/smoke.cjs            (capturas em build/test/)
//      node tools/test/smoke.cjs --rapido   (só 2 classes, sem celular)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const startServer = require('./server.cjs');
const OUT = path.resolve(__dirname, '../../build/test');
const fast = process.argv.includes('--rapido');
const CASES = [['gladiador', 'z2', 12], ['engenheiro', 'z4', 40], ['lanceiro', 'z6', 45], ['cacadora', 'z5', 55], ['paladino', 'z6', 55], ['valquiria', 'z7', 60], ['arcanista', 'z8', 72], ['cleriga', 'z9', 75]];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [], report = [];
  const watch = (p) => { p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/sandbox|Ignored call/.test(m.text())) errs.push(m.text()); }); };
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } }); watch(p);
  await p.goto(srv.url + '/index.html');
  let i = 0;
  for (const [cls, z, lvl] of fast ? CASES.slice(1, 3) : CASES) {
    await p.evaluate(([cls, z, lvl]) => { localStorage.clear(); slot = 0; S = newCharacter('Teste', cls); S.lvl = lvl; S.pts = lvl * 5; autoDistribute(); S.zone = z; save(); startGame(0); $('#modal').classList.add('hidden'); }, [cls, z, lvl]);
    await p.waitForTimeout(i === 0 ? 8000 : 5000);
    await p.screenshot({ path: `${OUT}/classe-${cls}.png` });
    report.push(await p.evaluate(() => `${S.cls.padEnd(10)} modelo3D=${!!(Scene3D._st.hero && Scene3D._st.hero.model)} monstros=${R.mons.length} abates=${S.stats.kills} mortes=${S.stats.deaths} invocação=${R.pet ? R.pet.name : '-'}`));
    i++;
  }
  // janelas, cidade e NPC
  for (const k of ['c', 'i', 'k', 'j', 'm']) { await p.keyboard.press(k); await p.waitForTimeout(150); await p.keyboard.press('Escape'); }
  await p.click('#town-btn'); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/cidade.png` });
  await p.click('[data-npc="guarda"]'); await p.waitForTimeout(3500);
  report.push('NPC aberto: ' + (await p.evaluate(() => R.npc)));
  await p.evaluate(() => { $('#modal').classList.add('hidden'); R.npc = null; setTown(false); });
  if (!fast) {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `${OUT}/celular.png` });
  }
  // Conta Full dentro de iframe sem allow-modals (como no claude.ai)
  fs.writeFileSync(path.resolve(__dirname, '../../build/sandbox.html'), '<!doctype html><iframe sandbox="allow-scripts allow-same-origin allow-popups allow-forms" src="/index.html" style="width:1200px;height:760px;border:0"></iframe>');
  const q = await b.newPage({ viewport: { width: 1220, height: 780 } }); watch(q);
  await q.goto(srv.url + '/build/sandbox.html'); await q.waitForTimeout(1500);
  const f = q.frames().find((x) => x.url().includes('index.html'));
  await f.evaluate(() => { localStorage.clear(); localStorage.setItem('valdaria_slot_0', JSON.stringify(newCharacter('Antigo', 'gladiador'))); renderSelect(); });
  await f.click('[data-act="full-account"]'); await q.waitForTimeout(300); await f.click('#dlg-ok'); await q.waitForTimeout(500);
  report.push('Conta Full: ' + (await f.evaluate(() => [0, 1, 2].map((i) => { const c = loadSlot(i); return c ? `${c.name}(${c.cls} nv${c.lvl})` : '-'; }).join(', '))));
  await b.close(); srv.close();
  console.log(report.join('\n'));
  console.log(errs.length ? `\n❌ ERROS (${errs.length}):\n` + [...new Set(errs)].join('\n') : '\n✅ Nenhum erro no console.');
  console.log(`Capturas em ${OUT}`);
  process.exit(errs.length ? 1 : 0);
})();
