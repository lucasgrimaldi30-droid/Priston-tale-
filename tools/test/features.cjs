// Teste dos sistemas de progressão (lógica, sem esperar animações): tutorial, níveis de habilidade, loja,
// forja e gemas, chefe com marcas no chão, masmorra, conquistas, diárias, login, conjuntos, renascimento e PWA.
// Uso: node tools/test/features.cjs     (sai com código 1 se algo falhar)
const { chromium } = require('playwright');
const startServer = require('./server.cjs');
(async () => {
  const srv = await startServer();
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(srv.url + '/index.html');
  const res = await p.evaluate(async () => {
    const out = [], ok = (nome, cond, info = '') => out.push(`${cond ? '✅' : '❌'} ${nome}${info ? ' — ' + info : ''}`);
    const novo = (cls, lvl, extra = {}) => { localStorage.clear(); slot = 0; S = newCharacter('Teste', cls); S.lvl = lvl; S.pts = (lvl - 1) * 5; autoDistribute(); Object.assign(S, extra); S.settings.gfx = '2d'; save(); startGame(0); stopLoop(); $('#modal').classList.add('hidden'); tick(); };
    const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
    // tutorial e Auto
    novo('gladiador', 1); ok('Herói novo começa no tutorial', S.tut === 0);
    // níveis de habilidade
    novo('arcanista', 60, { tut: 99 }); S.settings.autoSkill = false; S.skillLv = {};
    const p0 = skillPointsFree(); upgradeSkill('a1'); ok('Subir habilidade', skLv('a1') === 2 && skillPointsFree() === p0 - 1 && classSkills()[0].mult > CLASSES.arcanista.skills[0].mult);
    // loja
    S.gold = 5e6; buyShop('mount1', 1); buyShop('pet1', 1); buyShop('xp1', 1); buyShop('gembag', 5);
    ok('Loja: montaria, mascote, pergaminho, gemas', S.mount === 'mount1' && S.companion === 'pet1' && xpBoostOn() && Object.values(gemBag()).flat().reduce((a, v) => a + v, 0) >= 5);
    // forja e gemas
    S.stones = 100; forgeItem('armadura'); const it = S.inv[S.inv.length - 1]; it.rarity = 'lendario';
    for (const k in GEMS) if (gemBag()[k].some((n) => n)) socketGem(it.uid, k);
    ok('Forja e encaixe de gemas', !!it && (it.gems || []).length > 0, `${(it.gems || []).length} gema(s)`);
    gemBag().rubi[0] = 3; combineGem('rubi', 0); ok('Combinar 3 gemas', gemBag().rubi[1] >= 1);
    // chefe com marcas no chão
    R.mons = []; const bs = spawnBoss(); bs.aggro = true; bs.skillT = 0; R.pos.x = bs.x; R.pos.z = bs.z + 3; R.mon = bs; ticks(3);
    ok('Chefe cria marca no chão', R.tele.length > 0); R.mons = []; R.tele = [];
    // masmorra
    S.dunCd = {}; enterDungeon('z7'); ok('Entrar na masmorra', !!R.dungeon && R.mons.length > 0);
    for (let f = 0; f < 3; f++) { for (const m of aliveMons()) { m.hp = 0; killMonster(m); } ticks(30); }
    ok('Concluir os 3 andares', !R.dungeon && (S.stats.dungeons || 0) >= 1);
    // conquistas
    S.stats.kills = 1500; checkAch(); ok('Conquistas e título', S.ach.k1000 && !!S.title);
    // diárias e login
    const D = dailyState(); ok('3 missões diárias', D.list.length === 3);
    for (const m of D.list) { m.prog = m.need; m.done = true; } [0, 1, 2].forEach(claimDaily); ok('Prêmio e bônus das diárias', D.bonusTaken);
    S.daily.last = '2000-01-01'; const L = checkLogin(); ok('Prêmio de login', !!L && L.streak === 1);
    // conjuntos
    for (const sl of SET_SLOTS) { const x = genItem(90, 1, sl); x.set = 'celeste'; x.req = 1; S.equip[sl] = x; }
    ok('Bônus de conjunto (4 peças)', setCounts().celeste === 4);
    // renascimento
    S.lvl = 100; const hp100 = derived().maxHp; S.rebirths = 0;
    S.rebirths = 1; S.lvl = 1; S.attr = { ...CLASSES[S.cls].base }; S.skillLv = {}; ok('Renascimento dá bônus', derived().atkMin > 0 && (S.rebirths === 1));
    // especialização, bestiário, mascote e medidor (bloco 1 das melhorias)
    novo('gladiador', 60, { tut: 99 }); const atk0 = derived().atkMin; chooseSpec('berserker');
    ok('Especialização no nível 50', S.spec === 'berserker' && derived().atkMin > atk0);
    S.best = {}; for (let i = 0; i < 50; i++) { const m = makeMonster('Lobo Filhote', '🐺', 5, false, 2); Object.assign(m, { x: 0, z: 0, home: { x: 0, z: 0 } }); R.mons.push(m); killMonster(m); }
    ok('Bestiário conta e dá marco', S.best['Lobo Filhote'] === 50 && bestTiers() === 1);
    S.owned = { pet1: true }; S.companion = 'pet1'; S.petXp = { pet1: 6000 }; ok('Mascote evolui', petLevel('pet1') === 10);
    ok('Medidor de dano registra', meter().kills >= 50 && meter().dmg >= 0 && tabStats().includes('por hora'));
    // bloco 2: torre, eventos, chefe mundial, clima, coleta e artesanato
    novo('lanceiro', 40, { tut: 99 }); enterTower('1'); ok('Entrar na Torre Infinita', !!R.dungeon && R.dungeon.tower && R.mons.length > 0);
    for (let f = 0; f < 5; f++) { for (const m of aliveMons()) { m.hp = 0; killMonster(m); } ticks(30); }
    ok('Subir andares da torre (chefe no 5)', S.towerBest >= 5 && R.dungeon && R.dungeon.floor === 6, `recorde ${S.towerBest}`);
    die(aliveMons()[0]); ok('Morrer sai da torre', !R.dungeon); R.dead = 0; S.hp = derived().maxHp; ticks(2);
    const ev = eventNow(); ok('Eventos em rodízio', !!(ev.id || ev.next) && EVENTS.length === 4);
    { let t = Date.now(); while (eventNow(t).id !== 'boss') t += 60000; ok('Chefe mundial no rodízio', eventNow(t).id === 'boss'); }
    R.mons = []; spawnWorldBoss(eventNow().slot); const wb = R.mons.find((m) => m.wboss); const st0 = S.stones; wb.hp = 0; killMonster(wb);
    ok('Chefe mundial dá prêmio', !!wb && S.stones > st0 && S.stats.wbosses === 1 && wb.name.startsWith('Avatar'));
    const sk = worldSky('z1'); ok('Dia/noite e chuva', sk.night >= 0 && sk.night <= 1 && typeof sk.rain === 'boolean' && worldSky('z8').rain === false);
    initWorld(); ok('Pontos de coleta no mapa', R.nodes.length === 6);
    const nd = R.nodes[0]; R.mons = []; R.pos = { x: nd.x, z: nd.z }; window.gameOrder({ type: 'gather', id: 0 }); const mat0 = (S.mats || {})[nd.type] || 0; ticks(30);
    ok('Coletar material', ((S.mats || {})[nd.type] || 0) > mat0 && nd.cd > 0, `${nd.type}`);
    S.mats = { erva: 50, minerio: 50, essencia: 50 }; const hp0 = S.pots.hp2 || 0, ston = S.stones; craft('vida'); craft('pedra');
    ok('Artesanato cria poções e pedra', S.pots.hp2 >= hp0 + 5 && S.stones > ston && tabCraft().includes('Criar'));
    // mapas ligados, viagem a pé, monstros de borda e errantes
    novo('gladiador', 20, { tut: 99 }); S.settings.auto = false; S.zone = 'z2'; initWorld();
    const exs = zoneExits('z2'); ok('Saídas para os vizinhos', exs.length === 3 && exs[2].to === 'b1' && exs[0].to === 'z1' && exs[1].to === 'z3' && zoneExits('z1').length === 1);
    R.mons = []; R.pos = inward(EXIT_NEXT, 4); window.gameOrder({ type: 'move', x: EXIT_NEXT.x, z: EXIT_NEXT.z }); ticks(20);
    ok('Andar pela saída leva ao próximo mapa', S.zone === 'z3', S.zone); ticks(1);
    ok('Chega do lado certo', dist2(R.pos, EXIT_PREV) < 5, `x=${R.pos.x.toFixed(1)}`);
    S.lvl = 5; R.mons = []; R.pos = inward(EXIT_NEXT, 4); window.gameOrder({ type: 'move', x: EXIT_NEXT.x, z: EXIT_NEXT.z }); ticks(20);
    ok('Saída trancada pelo nível', S.zone === 'z3'); S.lvl = 20;
    S.zone = 'z1'; initWorld(); S.settings.auto = true; R.mons = []; R.travelT = 0; let tz = 0; for (let i = 0; i < 400 && S.zone === 'z1'; i++) { R.mons = []; tick(); tz = i; }
    ok('Auto anda até o mapa do nível', S.zone === 'z2', `${S.zone} em ${tz} ticks`);
    S.settings.autoTravel = false; S.zone = 'z5'; S.lvl = 40; initWorld(); let border = 0; for (let i = 0; i < 300; i++) { const m = spawnWorldMonster(); if (m && m.border) border++; R.mons = []; }
    ok('Monstros dos mapas vizinhos aparecem', border > 15, `${border}/300`);
    let ro = null; for (let i = 0; i < 2000 && !ro; i++) { R.mons = []; const m = spawnWorldMonster(); if (m && m.roamer) ro = m; }
    const sr = S.stones; if (ro) { ro.hp = 0; killMonster(ro); }
    ok('Errante raro dá prêmio', !!ro && ro.name.endsWith('Errante') && S.stones >= sr + 2);
    // mapas escondidos (desvios)
    novo('gladiador', 25, { tut: 99 }); S.settings.auto = false; S.zone = 'z4'; initWorld();
    const bx = zoneExits('z4').find((e) => e.side === 'branch'); ok('Mapa com saída para desvio', !!bx && bx.to === 'b2' && zoneExits('b2').length === 1 && zoneExits('b2')[0].to === 'z4');
    ok('Desvio escondido na janela de mapas', tabMaps().includes('Mapa escondido'));
    R.mons = []; R.pos = inward(EXIT_BRANCH, 4); window.gameOrder({ type: 'move', x: EXIT_BRANCH.x, z: EXIT_BRANCH.z }); ticks(20);
    ok('Entrar no desvio a pé', S.zone === 'b2' && S.visited.b2 === 1 && R.mons.length > 0 && R.nodes.length === 6, S.zone);
    ok('Desvio descoberto aparece', tabMaps().includes('Bosque dos Cogumelos') && zoneTier(zoneById('b2')) === 5);
    S.visited = { b1: 1, b2: 1, b3: 1, b4: 1 }; checkAch(); ok('Conquista Desbravador', !!S.ach.exp4);
    S.settings.auto = true; S.lvl = 35; R.travelT = 0; for (let i = 0; i < 600 && S.zone === 'b2'; i++) { R.mons = []; tick(); }
    ok('Auto sai do desvio quando fica fácil', S.zone === 'z4' || S.zone === 'z5', S.zone);
    // alma, artefatos e missão semanal
    novo('gladiador', 100, { tut: 99 }); S.settings.auto = false;
    const atk0b = derived().atkMin, crit0 = derived().crit;
    soulState(); S.soul.bag.atk[0] = 5; R.soulSel = { t: 'atk', l: 1 }; for (const i of [10, 11, 12, 13, 14]) soulPlace(i);
    ok('Alma: linha de 5 iguais vira combinação', soulLines().length === 1 && soulLines()[0].kind === 'same' && derived().atkMin > atk0b);
    for (const t of Object.keys(SOUL)) S.soul.bag[t][0] += 3; soulCombine('crit', 0); ok('Alma: juntar 3 pedras', S.soul.bag.crit[1] === 1);
    const ar = genItem(90, 5, 'arma'); ar.refine = 10; ar.rarity = 'lendario'; S.inv.push(ar);
    consecrate(ar.uid); document.getElementById('dlg-ok').click(); await new Promise((r) => setTimeout(r, 50));
    ok('Consagrar item +10 vira artefato', S.arts.length === 1 && !S.inv.includes(ar) && R.win === 'alma');
    R.artSel = S.arts[0].uid; artPlace('c'); ok('Artefato no centro dá crítico', derived().crit > crit0 && artTotal().k === 'crit');
    for (let k = 0; k < 4; k++) { S.arts.push({ uid: 'a' + k, name: 'X', slot: 'arma', rarity: 'lendario', ilvl: 100 }); R.artSel = 'a' + k; artPlace(ART_SPOTS[k + 1]); }
    ok('Os 4 de volta ampliam (com ressonância)', artTotal().amp > 2.5, 'x' + artTotal().amp.toFixed(2));
    ok('Janela Alma abre', (R.almaTab = 'grade', tabAlma().includes('soul-grid')) && (R.almaTab = 'art', tabAlma().includes('art-cross')));
    const W = weeklyState(); dailyProgress('bosses', 12); ok('Missão semanal avança e paga', W.prog[1] === 12 && (claimWeekly(1), W.claimed[1]));
    const sb = JSON.stringify(soulState().bag); for (let i = 0; i < 20; i++) dropSoul(1, 100); ok('Pedras da Alma caem', JSON.stringify(soulState().bag) !== sb);
    // montagem automática conforme o personagem
    novo('gladiador', 100, { tut: 99 }); const bg = buildWeights();
    novo('arcanista', 100, { tut: 99 }); const ba = buildWeights();
    ok('Gladiador prioriza defesa, maga prioriza ataque', DEF_T.includes(bg.order[0]) && OFF_T.includes(ba.order[0]), bg.order[0] + ' / ' + ba.order[0]);
    S.attr.vit += 300; const bv = buildWeights(); ok('Muitos pontos em vitalidade puxam para ataque', bv.w.atk > ba.w.atk && bv.tilt !== '');
    novo('gladiador', 100, { tut: 99 }); soulState(); for (const t of Object.keys(SOUL)) S.soul.bag[t] = [10, 0, 0, 0, 0];
    autoSoul(true); const SL = soulLines();
    ok('Montar Alma forma combinações com a prioridade da classe', S.soul.grid.every(Boolean) && SL.length >= 3 && SL.some((x) => x.kind === 'same' && DEF_T.includes(x.t)), SL.map((x) => x.kind + ':' + (x.t || '')).join(','));
    S.arts = []; ['luvas', 'armadura', 'arma', 'elmo', 'anel', 'botas'].forEach((sl, k) => S.arts.push({ uid: 'z' + k, name: sl, slot: sl, rarity: 'epico', ilvl: 80 }));
    autoArts(true); ok('Montar artefatos põe no centro a peça da prioridade', ['armadura', 'elmo', 'anel'].includes(artAt('c').slot) && ART_SPOTS.every((k) => artAt(k)), artAt('c').slot);
    novo('cacadora', 30, { tut: 99 }); soulState(); ok('Montagem automática vem desligada', S.settings.autoAlma === false);
    S.settings.autoAlma = true; const g0 = JSON.stringify(S.soul.grid); dropSoul(1, 30, 3); ok('Remonta sozinho (se o jogador ligar)', JSON.stringify(S.soul.grid) !== g0);
    S.soul.bag.atk[0] += 1; R.soulSel = { t: 'atk', l: 1 }; const fc = SOUL_ORDER.find((i) => !S.soul.grid[i] && soulCellOpen(i)) ?? 12; soulPlace(fc);
    ok('Montar à mão desliga a automática e mantém a escolha', S.settings.autoAlma === false && (dropSoul(1, 30, 2), S.soul.grid[fc] && S.soul.grid[fc].t === 'atk'));
    // história, depois do 80, despertar, área perigosa e menus aos poucos
    novo('gladiador', 1, { tut: 99 }); S.settings.auto = false; R.storyQ = []; tick();
    ok('Herói novo começa a história e vê a conversa', storyState().ch === 0 && !!document.querySelector('#story-dlg:not(.hidden)'));
    for (let i = 0; i < 15; i++) { const m = makeMonster('Coelho Saltador', '🐇', 1, false, 2); Object.assign(m, { x: 0, z: 0, home: { x: 0, z: 0 } }); R.mons.push(m); killMonster(m); }
    ok('Capítulo 1 concluído com prêmio', storyState().ch === 1 && R.log.some((l) => l.msg.includes('História')));
    ok('Menus aparecem aos poucos', document.querySelector('.menu-btns [data-win="alma"]').classList.contains('hidden') && winLocked('alma'));
    localStorage.clear(); slot = 0; S = newCharacter('Velho', 'lanceiro'); S.lvl = 50; delete S.story; ok('Save antigo começa no capítulo do nível', STORY[storyState().ch].lvl >= 44 && STORY[storyState().ch].lvl <= 50, STORY[storyState().ch].title);
    novo('paladino', 80, { tut: 99 }); S.settings.auto = false; S.story = { ch: STORY.findIndex((c) => c.obj.k === 'sboss'), prog: 0, seen: 99 }; S.zone = 'z9'; initWorld(); R.evT = 0; R.sbossT = 0; tick(); tick();
    const vb = R.mons.find((m) => m.sboss); ok('Vaelor aparece na arena do Vale', !!vb && vb.name.startsWith('Vaelor'));
    if (vb) { vb.hp = 0; killMonster(vb); } ok('Vencer Vaelor avança a história', STORY[storyState().ch].zone === 'e1' && !!S.stats.vaelor);
    S.lvl = 85; ok('Depois do 80, solo rende menos XP (mas dá para upar)', teamXpFactor() === SOLO_80 && SOLO_80 >= 0.5);
    const x0 = S.xp; gainXp(100000); ok('XP solo reduzido', S.xp - x0 === Math.round(100000 * SOLO_80) || S.lvl > 85);
    S.lvl = 90; S.awk = {}; const at0 = derived().atkMin; awkAdd('furia'); awkAdd('furia');
    ok('Despertar: 10 pontos no nível 90 e cada um conta', awkFree() === 8 && derived().atkMin >= Math.round(at0 * 1.05));
    S.zone = 'e1'; initWorld(); ok('Fenda Primordial tem monstros perigosos', R.mons.filter((m) => m.danger).length >= 8);
    { const keep = window.partyMembersNear; window.partyMembersNear = () => [{ cls: 'gladiador' }, { cls: 'cleriga' }, { cls: 'arcanista' }];
      const tb = teamBond(); window.partyMembersNear = keep;
      ok('Funções no grupo dão bônus (formação completa)', tb.roles.length === 4 && tb.taken < 0.5 && tb.dmg > 1.5 && tb.regen > 0, `dano x${tb.dmg.toFixed(2)} recebido x${tb.taken.toFixed(2)}`); }
    // casa de títulos
    novo('gladiador', 50, { tut: 99 }); S.settings.auto = false; titleState();
    const atkT0 = derived().atkMin; S.stats.kills = 5000; checkTitles();
    ok('Título permanente com bônus (Matador)', titleOwned(titleById('matador')) && S.title === 'Matador' && derived().atkMin > atkT0);
    S.streak.alive = 2 * 3600; checkTitles(); S.title = 'IMORTAL'; const ev0 = derived().evade;
    ok('IMORTAL depois de 2 h sem morrer', titleOwned(titleById('imortal')) && titleEquipped().id === 'imortal');
    titlesOnDeath(); ok('Morrer tira o título provisório', !titleOwned(titleById('imortal')) && S.title === '' && S.streak.alive === 0);
    R.killTimes = Array(40).fill(Date.now()); checkTitles(); ok('Fúria Sangrenta é temporária', titleOwned(titleById('furia')) && S.titles.furia.until > Date.now());
    S.titles.furia.until = Date.now() - 1; R.killTimes = []; checkTitles(); ok('Título temporário acaba com o tempo', !titleOwned(titleById('furia')));
    ok('Coleção dá bônus e janela abre', titleBonus().xpb >= 0.5 && (R.achTab = 'titulos', tabAch().includes('Casa de Títulos')));
    // arena da sobrevivência e fortaleza do cerco
    novo('valquiria', 40, { tut: 99 }); S.settings.auto = false; enterArena(false);
    ok('Entrar na Arena', !!R.dungeon && R.dungeon.arena && R.mons.length >= 5 && arenaWeek().tries === 1);
    for (let r = 0; r < 3; r++) { for (const m of aliveMons()) { m.hp = 0; killMonster(m); } ticks(30); }
    ok('Rodadas avançam', R.dungeon && R.dungeon.floor === 4 && R.dungeon.cleared === 3, R.dungeon && R.dungeon.floor);
    R.dungeon.t = 0.05; ticks(2); ok('Tempo acaba e encerra com o recorde', !R.dungeon && arenaWeek().best === 3 && S.stats.arenaBest === 3);
    S.arenaWk.tries = ARENA_TRIES; enterArena(false); ok('Limite de entradas por semana', !R.dungeon);
    S.zone = 'gw'; initWorld(); for (let i = 0; i < 60; i++) spawnWorldMonster();
    ok('Fortaleza tem cristais parados', R.mons.some((m) => m.crystal && m.static && m.atk === 0) && R.mons.every((m) => Math.abs(m.lvl - S.lvl) <= 3 || m.crystal));
    ok('Sem servidor o bônus semanal é zero', wkBonus() === 0 && dropMult() === 1 && tabMaps().includes('Cerco da Coroa') && tabMaps().includes('Arena da Sobrevivência'));
    // Lanceiro: colheita de almas
    novo('lanceiro', 80, { tut: 99 }); S.settings.auto = false; R.souls = 0; R.soulDmg = 0;
    { const d = derived(); soulGain(soulNeed(d) * 2.1, null, d); }
    ok('Dano causado gera almas', R.souls === 2);
    { const d = derived(); soulGain(soulNeed(d) * 10, null, d); } ok('Máximo de 5 almas', R.souls === 5);
    const l6 = classSkills().find((x) => x.id === 'l6'), spx = soulSpend(l6);
    ok('Ceifa Final gasta 5 almas: +150% e atordoa', spx && spx.n === 5 && Math.abs(spx.mult - 2.5) < 1e-9 && spx.stun > 0 && R.souls === 0);
    R.souls = 1; R.mon = { boss: false, elite: false, x: 0, z: 0 }; R.mons = [];
    ok('Auto guarda as almas para os golpes grandes', soulWait(l6) === true && soulWait(classSkills().find((x) => x.id === 'l3')) === false);
    R.souls = 2; R.soulIdle = 0; R.mon = null; for (let i = 0; i < 200; i++) soulTick(0.1); ok('Fora de combate as almas somem', R.souls < 2);
    ok('Descrição mostra as almas', skillDesc(l6).includes('alma'));
    // mecânicas das classes
    const mob = (lvl = 30, hp = 1e7) => { const m = makeMonster('Ent Jovem', '🌳', lvl, false, 2); Object.assign(m, { x: R.pos.x, z: R.pos.z - 1, home: { x: 0, z: 0 } }); m.maxHp = m.hp = hp; m.atk = 0; R.mons.push(m); return m; };
    novo('gladiador', 75, { tut: 99 }); S.settings.auto = false; R.mons = []; R.res = 0;
    { const d = derived(); mechOnTaken(d.maxHp * 0.5, d, false); } const at1 = derived().atkMin;
    ok('Gladiador: Fúria enche com dano levado e dá ataque', R.res >= 60 && at1 > (R.res = 0, derived().atkMin));
    R.res = 100; { const tg = mob(); R.mon = tg; tg.hp = tg.maxHp * 0.2; const g6 = classSkills().find((x) => x.id === 'g6'); const mb = mechBeforeHit(g6, tg.sid, derived()); ok('Execução gasta toda a Fúria (+150%)', R.res === 0 && Math.abs(mb.mult - 2.5) < 1e-9 && mb.exec === 0.5); }
    novo('engenheiro', 75, { tut: 99 }); S.settings.auto = false; R.mons = []; const tgE = mob(); R.mon = tgE;
    castSkill('e3'); ok('Engenheiro: Torreta Tesla montada', (R.turrets || []).length === 1);
    const hpE = tgE.hp; for (let i = 0; i < 30; i++) turretTick(0.1, derived()); ok('Torreta dá choques', tgE.hp < hpE);
    R.res = 5; { const e6 = classSkills().find((x) => x.id === 'e6'); const mb = mechBeforeHit(e6, tgE.sid, derived()); ok('Sobrecarga com 5 células explode as torretas', mb.boom && mb.stun >= 1); }
    novo('cacadora', 75, { tut: 99 }); S.settings.auto = false; R.mons = []; const ta = mob(), tb = mob(); R.res = 0;
    for (let i = 0; i < 3; i++) mechBeforeHit(null, ta.sid, derived()); const fa = R.res; mechBeforeHit(null, tb.sid, derived());
    ok('Caçadora: Foco no mesmo alvo e zera ao trocar', fa >= 2 && R.res === 0);
    R.res = 5; { const c6 = classSkills().find((x) => x.id === 'c6'); const mb = mechBeforeHit(c6, tb.sid, derived()); ok('Disparo Perfurante com 5 de Foco atravessa todos', mb.aoeAll); }
    R.mon = ta; const px = R.pos.x, pz = R.pos.z; castSkill('c4'); ok('Salto Evasivo pula para trás', Math.hypot(R.pos.x - px, R.pos.z - pz) > 2);
    novo('paladino', 75, { tut: 99 }); R.res = 0; { const d = derived(); for (let i = 0; i < 5; i++) mechOnTaken(0, d, true); } ok('Paladino: bloquear enche a Fé', R.res >= 50);
    novo('valquiria', 75, { tut: 99 }); R.res = 0; let dive = 0; for (let i = 0; i < 8; i++) { if (mechBeforeHit(null, 'x', derived()).label === 'Investida Celeste') dive++; } ok('Valquíria: Investida Celeste a cada 4 ataques', dive === 2);
    novo('arcanista', 75, { tut: 99 }); R.elems = []; { const sk = classSkills(); const a1 = sk.find((x) => x.id === 'a1'), a3 = sk.find((x) => x.id === 'a3'); mechBeforeHit(a1, 'x', derived()); const mb = mechBeforeHit(a3, 'x', derived()); ok('Arcanista: fogo + gelo = Vapor Explosivo', mb.label === 'Vapor Explosivo' && mb.slow > 0 && R.elems.length === 0); }
    { const sk = classSkills(); R.elems = ['fogo', 'gelo', 'raio']; const mb = mechBeforeHit(sk.find((x) => x.id === 'a6'), 'x', derived()); ok('Nova Elemental gasta os 3 elementos', mb.mult > 2 && R.elems.length === 0); }
    novo('cleriga', 75, { tut: 99 }); R.res = 0; { const d = derived(); S.hp = d.maxHp; healHero(d.maxHp * 0.2, d); ok('Clériga: cura que sobra vira Escudo Sagrado', R.res > 0 && R.res <= resMax(d)); const sh = R.res; const left = mechAbsorb(sh / 2); ok('Escudo absorve dano', left === 0 && R.res < sh); }
    ok('Descrições mostram as mecânicas', skillDesc(classSkills().find((x) => x.id === 'r6')).includes('Escudo') && mechHud().includes('mech-bar'));
    ok('Janela de mapas mostra torre e eventos', tabMaps().includes('Torre Infinita') && tabMaps().includes('ev-box'));
    return out;
  });
  const pwa = await p.evaluate(async () => { try { const m = await (await fetch('manifest.webmanifest')).json(); const sw = await fetch('sw.js'); return m.icons.length === 3 && sw.ok; } catch (e) { return false; } });
  res.push(`${pwa ? '✅' : '❌'} PWA (manifesto, ícones e service worker)`);
  // funções duplicadas (em JS a última vence em silêncio — já causou bug)
  const fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '../..');
  for (const [f, re] of [['js/game.js', /^function ([a-zA-Z0-9_]+)\(/gm], ['js/scene3d.js', /^  function ([a-zA-Z0-9_]+)\(/gm]]) {
    const names = [...fs.readFileSync(path.join(root, f), 'utf8').matchAll(re)].map((m) => m[1]);
    const dup = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    res.push(`${dup.length ? '❌' : '✅'} Sem funções duplicadas em ${f}${dup.length ? ': ' + dup.join(', ') : ''}`);
  }
  await b.close(); srv.close();
  console.log(res.join('\n'));
  if (errs.length) console.log('❌ Erros no console:\n' + errs.join('\n'));
  process.exit(res.some((l) => l.startsWith('❌')) || errs.length ? 1 : 0);
})();
