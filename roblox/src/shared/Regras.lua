-- Regras do jogo (as mesmas contas do jogo do navegador, js/game.js), usadas pelo servidor e pela interface.
local D = require(script.Parent:WaitForChild("Dados"))
local R = {}

R.MAX_LEVEL = 100
R.PONTOS_POR_NIVEL = 5
R.ATRIBUTOS = { "for", "int", "des", "agi", "vit" }
R.NOME_ATRIBUTO = { ["for"] = "Força", int = "Intelecto", des = "Destreza", agi = "Agilidade", vit = "Vitalidade" }
R.SLOTS_ARMADURA = { "escudo", "elmo", "armadura", "luvas", "botas", "amuleto", "anel" }
R.DEF_SLOT = { armadura = 1.0, escudo = 0.7, elmo = 0.5, luvas = 0.3, botas = 0.35, amuleto = 0, anel = 0 }
R.ABATES_CHEFE = 25

local function arred(x) return math.floor(x + 0.5) end
local function limitar(x, a, b) if x < a then return a elseif x > b then return b end return x end
R.arred, R.limitar = arred, limitar
function R.rnd(a, b) return a + math.random() * (b - a) end

function R.xpNeed(l)
	local m = 1
	if l >= 80 then m = 1 + (l - 79) * 0.08 end
	return math.floor(40 * (l ^ 2.6) * m + 60)
end

-- faixa de nível de cada mapa: do mínimo dele até o mínimo do próximo
function R.faixaMapa(i)
	local z = D.ZONES[i]
	local prox = D.ZONES[i + 1]
	local max = prox and (prox.min - 1) or (z.min + 14)
	if max < z.min then max = z.min end
	return z.min, max
end

function R.monstro(nivel, chefe)
	local k = chefe and 1 or 0
	local hp = arred((30 + (nivel ^ 1.5) * 10) * (chefe and 10 or 1))
	return {
		lvl = nivel, chefe = chefe, hp = hp, maxHp = hp,
		atk = arred((4 + nivel * 3.2) * (chefe and 1.8 or 1)),
		def = arred(nivel * 1.5 * (chefe and 1.5 or 1)),
		xp = arred((8 + (nivel ^ 1.5) * 3) * (chefe and 12 or 1)),
		ouro = arred((2 + nivel * 1.5) * (chefe and 15 or 1) * R.rnd(0.8, 1.2)),
		k = k,
	}
end

-- ---------- itens ----------
local function indiceRaridade(id)
	for i, r in ipairs(D.RARITIES) do if r.id == id then return i end end
	return 1
end
R.indiceRaridade = indiceRaridade
function R.raridade(it) return D.RARITIES[indiceRaridade(it.rarity)] end

local function sortearRaridade(boost)
	local total = 0
	for i, r in ipairs(D.RARITIES) do total = total + r.w * (i > 1 and boost or 1) end
	local x = math.random() * total
	for i, r in ipairs(D.RARITIES) do
		x = x - r.w * (i > 1 and boost or 1)
		if x <= 0 then return r end
	end
	return D.RARITIES[1]
end

function R.maoes(wt) local w = D.WEAPON_INFO[wt]; return w and w.hands or 1 end
function R.multArma(wt)
	local w = D.WEAPON_INFO[wt]
	if w and w.mult then return w.mult end
	return R.maoes(wt) == 2 and D.TWO_HAND_MULT or 1
end
function R.armasDaClasse(cls) local c = D.CLASSES[cls]; return { c.weapon, c.weapon2 } end
function R.podeUsar(cls, it)
	if it.slot ~= "arma" then return true end
	local c = D.CLASSES[cls]
	if c.anyWeapon then return true end
	return it.wtype == c.weapon or it.wtype == c.weapon2
end

local contador = 0
local function novoId()
	contador = contador + 1
	return tostring(math.floor(os.clock() * 1000)) .. "-" .. tostring(math.random(1, 1e6)) .. "-" .. contador
end

function R.gerarItem(cls, ilvl, boost, slot)
	local rar = sortearRaridade(boost or 1)
	local tier = limitar(math.floor(ilvl / 17), 0, 5)
	if not slot then
		if math.random() < 0.35 then slot = "arma" else slot = R.SLOTS_ARMADURA[math.random(1, #R.SLOTS_ARMADURA)] end
	end
	local it = { uid = novoId(), slot = slot, ilvl = ilvl, rarity = rar.id, min = 0, max = 0, def = 0, affixes = {}, refine = 0, req = math.max(1, ilvl - 3) }
	if slot == "arma" then
		local proprias = R.armasDaClasse(cls)
		it.wtype = proprias[math.random(1, 2)]
		it.name = D.WEAPON_NAMES[it.wtype][tier + 1]
		local base = (5 + ilvl * 2.2) * rar.mult * R.rnd(0.9, 1.1) * R.multArma(it.wtype)
		it.min = arred(base)
		it.max = arred(base * R.rnd(1.45, 1.75))
	else
		it.name = D.ARMOR_SLOTS[slot].names[tier + 1]
		it.def = arred((3 + ilvl * 1.3) * R.DEF_SLOT[slot] * rar.mult * R.rnd(0.9, 1.1))
	end
	local n = rar.affixes + ((slot == "amuleto" or slot == "anel") and 1 or 0)
	local pool = {}
	for _, a in ipairs(D.AFFIXES) do table.insert(pool, a) end
	local ri = indiceRaridade(rar.id) - 1
	for _ = 1, n do
		if #pool == 0 then break end
		local a = table.remove(pool, math.random(1, #pool))
		local val = a.per * ilvl * R.rnd(0.6, 1.2) * (0.8 + ri * 0.15)
		if a.pct then
			val = math.max(0.5, math.floor(val * 10 + 0.5) / 10)
			val = math.min(val, a.stat == "crit" and 15 or 50)
		else
			val = math.max(1, arred(val))
		end
		table.insert(it.affixes, { stat = a.stat, val = val })
	end
	return it
end

function R.armaInicial(cls)
	local w = D.CLASSES[cls].weapon
	local k = R.multArma(w)
	return { uid = novoId(), slot = "arma", wtype = w, name = D.WEAPON_NAMES[w][1], ilvl = 1, rarity = "comum", min = arred(4 * k), max = arred(7 * k), def = 0, affixes = {}, refine = 0, req = 1 }
end

function R.multRefino(it) return 1 + (it.refine or 0) * 0.08 end
function R.pontuacao(it)
	local ri = indiceRaridade(it.rarity) - 1
	local base = it.slot == "arma" and (it.min + it.max) / 2 or it.def
	return base * R.multRefino(it) * 1.5 + #it.affixes * it.ilvl * 0.6 + ri * it.ilvl * 0.4
end
function R.valor(it)
	local ri = indiceRaridade(it.rarity) - 1
	return arred((4 + it.ilvl * 3) * (1 + ri * ri * 0.8) * (1 + (it.refine or 0) * 0.25))
end

-- ---------- herói ----------
function R.novoHeroi(cls)
	local c = D.CLASSES[cls]
	local attr = {}
	for _, k in ipairs(R.ATRIBUTOS) do attr[k] = c.base[k] end
	return {
		v = 1, cls = cls, lvl = 1, xp = 0, gold = 50, pts = 0, attr = attr,
		equip = { arma = R.armaInicial(cls) }, inv = {},
		zone = 1, kills = {}, auto = true, pots = { hp = 20, mp = 20 },
		stats = { kills = 0, deaths = 0, bosses = 0 },
	}
end

-- pontos automáticos: atributo principal e vitalidade (3 para 2), como no jogo
function R.distribuir(h)
	local c = D.CLASSES[h.cls]
	local main = c.main
	while h.pts > 0 do
		local n = h.attr[main] - c.base[main]
		local v = h.attr.vit - c.base.vit
		if n * 2 <= v * 3 then h.attr[main] = h.attr[main] + 1 else h.attr.vit = h.attr.vit + 1 end
		h.pts = h.pts - 1
	end
end

-- atributos derivados (vida, ataque, defesa...) a partir do herói salvo e dos efeitos ativos
function R.ficha(h, buffs)
	local c = D.CLASSES[h.cls]
	local bonus = setmetatable({}, { __index = function() return 0 end })
	local wmin, wmax, def = 1, 3, 0
	for _, sl in ipairs(D.SLOT_ORDER) do
		local it = h.equip[sl]
		if it and h.lvl >= it.req then
			local m = R.multRefino(it)
			if sl == "arma" then
				if R.podeUsar(h.cls, it) then wmin, wmax = it.min * m, it.max * m end
			else
				def = def + it.def * m
			end
			for _, a in ipairs(it.affixes) do bonus[a.stat] = bonus[a.stat] + a.val end
		end
	end
	local A = {}
	for _, k in ipairs(R.ATRIBUTOS) do A[k] = h.attr[k] + bonus[k] end
	local main = A[c.main]
	local B = setmetatable({}, { __index = function() return 0 end })
	for _, b in ipairs(buffs or {}) do B[b.stat] = B[b.stat] + b.val end
	for _, sk in ipairs(c.skills) do
		if sk.type == "passive" and sk.stat and h.lvl >= sk.lvl then B[sk.stat] = B[sk.stat] + sk.val end
	end
	local atkMul = 1 + B.atk + bonus.atkp / 100
	local baseHp = 40 + A.vit * 8 + h.lvl * 10 + bonus.hp
	return {
		A = A,
		maxHp = arred(baseHp * (1 + B.hpmax)),
		maxMp = arred(15 + A.int * 4 + h.lvl * 3 + bonus.mp),
		atkMin = arred((wmin + main * 0.8 + h.lvl) * atkMul),
		atkMax = arred((wmax + main * 1.0 + h.lvl) * atkMul),
		def = arred((def + A.agi * 0.6 + A.vit * 0.2) * (1 + B.def)),
		crit = limitar(5 + A.des * 0.08 + bonus.crit + B.crit * 100, 0, 75),
		critMult = (c.critMult or 1.75) + B.critdmg,
		aps = c.speed * (1 + A.agi / 400) * (1 + B.spd),
		evade = limitar(A.agi * 0.0012 + B.evade, 0, 0.55),
		block = limitar((h.equip.escudo and 0.08 or 0) + B.block, 0, 0.6),
		absorb = limitar(B.absorb, 0, 0.6),
		reflect = B.reflect,
		mshield = limitar(B.mshield, 0, 0.8),
		hpRegen = 0.01 * baseHp + A.vit * 0.1,
		mpRegen = 0.015 * (15 + A.int * 4 + h.lvl * 3) + A.int * 0.05,
		xpb = bonus.xpb, goldb = bonus.gold,
		alcance = (D.WEAPON_INFO[(h.equip.arma and h.equip.arma.wtype) or c.weapon] or {}).ranged and 26 or 7,
	}
end

-- texto curto de uma habilidade (interface)
local ROTULO = { atk = "ataque", def = "defesa", crit = "crítico", critdmg = "dano crítico", spd = "velocidade", evade = "esquiva", block = "bloqueio", absorb = "redução de dano", reflect = "reflexo", hpmax = "vida máxima", undead = "dano em mortos-vivos", mshield = "escudo de mana" }
function R.textoHabilidade(sk)
	local custo = sk.cd and (" Recarga " .. sk.cd .. "s, " .. sk.mp .. " MP.") or ""
	if sk.type == "dmg" then return "Causa " .. arred(sk.mult * 100) .. "% de dano" .. (sk.hits and (" em " .. sk.hits .. " golpes") or "") .. "." .. custo end
	if sk.type == "aoe" then return "Causa " .. arred(sk.mult * 100) .. "% de dano em " .. (sk.targets and ("até " .. sk.targets .. " monstros") or "todos por perto") .. (sk.stun and (", atordoa " .. sk.stun .. "s") or "") .. "." .. custo end
	if sk.type == "heal" then return "Cura " .. arred(sk.mult * 100) .. "% da vida de você e dos aliados por perto." .. custo end
	if sk.type == "passive" then
		if sk.revive then return "Passiva: ao morrer, volta na hora com 60% da vida (a cada " .. sk.revive .. "s)." end
		return "Passiva: +" .. arred(sk.val * 100) .. "% de " .. (ROTULO[sk.stat] or sk.stat) .. "."
	end
	if sk.type == "summon" or sk.type == "turret" then return "Invoca um aliado que bate junto por " .. sk.dur .. "s." .. custo end
	if sk.type == "stealth" then return "Some por " .. sk.dur .. "s: os monstros erram e o próximo golpe é crítico." .. custo end
	local t = "+" .. arred(sk.val * 100) .. "% de " .. (ROTULO[sk.stat] or sk.stat)
	if sk.also then t = t .. " e +" .. arred(sk.also.val * 100) .. "% de " .. (ROTULO[sk.also.stat] or sk.also.stat) end
	return t .. " por " .. sk.dur .. "s." .. custo
end

return R
