-- Crônicas de Valdária (Roblox) — servidor: mundo, monstros, combate, habilidades, itens e salvamento.
-- As contas vêm de ReplicatedStorage.Regras (as mesmas do jogo do navegador).
local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local Lighting = game:GetService("Lighting")
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")

local D = require(RS:WaitForChild("Dados"))
local R = require(RS:WaitForChild("Regras"))

-- ---------- canais com a interface ----------
local pastaRemotos = Instance.new("Folder")
pastaRemotos.Name = "Remotos"
pastaRemotos.Parent = RS
local function remoto(nome)
	local r = Instance.new("RemoteEvent")
	r.Name = nome
	r.Parent = pastaRemotos
	return r
end
local evEscolher = remoto("Escolher") -- cliente -> servidor: classe escolhida
local evAcao = remoto("Acao")         -- cliente -> servidor: alvo, habilidade, auto, mapa, chefe, equipar...
local evEstado = remoto("Estado")     -- servidor -> cliente: vida, mana, XP, alvo... (várias vezes por segundo)
local evFicha = remoto("Ficha")       -- servidor -> cliente: herói completo (quando muda)
local evAviso = remoto("Aviso")       -- servidor -> cliente: mensagens do registro e avisos grandes

-- ---------- luz ----------
Lighting.ClockTime = 14.5
Lighting.Brightness = 2.2
Lighting.OutdoorAmbient = Color3.fromRGB(150, 140, 130)
Lighting.Ambient = Color3.fromRGB(80, 70, 70)
do
	local atm = Instance.new("Atmosphere")
	atm.Density = 0.28
	atm.Color = Color3.fromRGB(255, 230, 200)
	atm.Decay = Color3.fromRGB(120, 100, 90)
	atm.Parent = Lighting
	local bloom = Instance.new("BloomEffect")
	bloom.Intensity = 0.6
	bloom.Threshold = 1.4
	bloom.Parent = Lighting
end

-- ---------- mundo: os 10 mapas lado a lado ----------
local ESPACO, TAM = 320, 230
local TEMAS = {
	{ chao = Color3.fromRGB(116, 176, 82), det = Color3.fromRGB(64, 128, 48), mon = Color3.fromRGB(214, 184, 140), prop = "arvore" },
	{ chao = Color3.fromRGB(78, 132, 64), det = Color3.fromRGB(38, 92, 40), mon = Color3.fromRGB(128, 96, 64), prop = "arvore" },
	{ chao = Color3.fromRGB(86, 98, 72), det = Color3.fromRGB(58, 72, 50), mon = Color3.fromRGB(116, 150, 86), prop = "junco" },
	{ chao = Color3.fromRGB(72, 66, 72), det = Color3.fromRGB(112, 104, 96), mon = Color3.fromRGB(150, 146, 156), prop = "pedra" },
	{ chao = Color3.fromRGB(218, 182, 122), det = Color3.fromRGB(176, 136, 86), mon = Color3.fromRGB(192, 120, 70), prop = "cacto" },
	{ chao = Color3.fromRGB(78, 72, 84), det = Color3.fromRGB(124, 118, 112), mon = Color3.fromRGB(222, 216, 200), prop = "lapide" },
	{ chao = Color3.fromRGB(228, 236, 246), det = Color3.fromRGB(150, 176, 200), mon = Color3.fromRGB(196, 228, 255), prop = "pinheiro" },
	{ chao = Color3.fromRGB(92, 42, 32), det = Color3.fromRGB(56, 24, 20), mon = Color3.fromRGB(255, 104, 44), prop = "pedra" },
	{ chao = Color3.fromRGB(142, 122, 92), det = Color3.fromRGB(100, 90, 70), mon = Color3.fromRGB(172, 152, 122), prop = "pedra" },
	{ chao = Color3.fromRGB(38, 28, 58), det = Color3.fromRGB(84, 62, 146), mon = Color3.fromRGB(156, 104, 255), prop = "cristal" },
}
local function centro(i) return Vector3.new((i - 1) * ESPACO, 0, 0) end

local mundo = Instance.new("Folder")
mundo.Name = "Mundo"
mundo.Parent = workspace
local pastaMonstros = Instance.new("Folder")
pastaMonstros.Name = "Monstros"
pastaMonstros.Parent = workspace
local pastaEfeitos = Instance.new("Folder")
pastaEfeitos.Name = "Efeitos"
pastaEfeitos.Parent = workspace

local function peca(pai, tam, cf, cor, forma, material, colide)
	local p = Instance.new("Part")
	p.Size = tam
	p.CFrame = cf
	p.Color = cor
	p.Anchored = true
	p.CanCollide = colide == true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = material or Enum.Material.SmoothPlastic
	if forma then p.Shape = forma end
	p.Parent = pai
	return p
end

local function criarProp(pai, tipo, pos, t)
	local s = R.rnd(0.8, 1.6)
	if tipo == "arvore" then
		peca(pai, Vector3.new(1.2, 6, 1.2) * s, CFrame.new(pos + Vector3.new(0, 3 * s, 0)), Color3.fromRGB(110, 76, 48), Enum.PartType.Cylinder, Enum.Material.Wood, true).CFrame = CFrame.new(pos + Vector3.new(0, 3 * s, 0)) * CFrame.Angles(0, 0, math.rad(90))
		peca(pai, Vector3.new(7, 7, 7) * s, CFrame.new(pos + Vector3.new(0, 7.5 * s, 0)), t.det, Enum.PartType.Ball, Enum.Material.Grass)
	elseif tipo == "pinheiro" then
		peca(pai, Vector3.new(1, 4, 1) * s, CFrame.new(pos + Vector3.new(0, 2 * s, 0)), Color3.fromRGB(96, 70, 50), nil, Enum.Material.Wood, true)
		for k = 0, 2 do
			peca(pai, Vector3.new(6 - k * 1.6, 2.4, 6 - k * 1.6) * s, CFrame.new(pos + Vector3.new(0, (4 + k * 2) * s, 0)) * CFrame.Angles(0, math.rad(45 * k), 0), Color3.fromRGB(40, 92, 70), nil, Enum.Material.Grass)
		end
		peca(pai, Vector3.new(2, 1, 2) * s, CFrame.new(pos + Vector3.new(0, 10 * s, 0)), Color3.fromRGB(240, 248, 255), nil, Enum.Material.Snow)
	elseif tipo == "pedra" then
		peca(pai, Vector3.new(R.rnd(3, 7), R.rnd(2, 5), R.rnd(3, 7)) * s, CFrame.new(pos + Vector3.new(0, 1.5 * s, 0)) * CFrame.Angles(R.rnd(-0.3, 0.3), R.rnd(0, 6), R.rnd(-0.3, 0.3)), t.det, nil, Enum.Material.Slate, true)
	elseif tipo == "cacto" then
		peca(pai, Vector3.new(1.4, 6, 1.4) * s, CFrame.new(pos + Vector3.new(0, 3 * s, 0)), Color3.fromRGB(70, 130, 70), nil, Enum.Material.Grass, true)
		peca(pai, Vector3.new(1, 3, 1) * s, CFrame.new(pos + Vector3.new(1.2 * s, 4 * s, 0)), Color3.fromRGB(70, 130, 70), nil, Enum.Material.Grass)
	elseif tipo == "lapide" then
		peca(pai, Vector3.new(2.4, 3.2, 0.7) * s, CFrame.new(pos + Vector3.new(0, 1.6 * s, 0)) * CFrame.Angles(0, R.rnd(0, 6), R.rnd(-0.15, 0.15)), t.det, nil, Enum.Material.Cobblestone, true)
	elseif tipo == "cristal" then
		local c = peca(pai, Vector3.new(1.5, R.rnd(4, 9), 1.5) * s, CFrame.new(pos + Vector3.new(0, 3 * s, 0)) * CFrame.Angles(R.rnd(-0.4, 0.4), R.rnd(0, 6), R.rnd(-0.4, 0.4)), t.mon, nil, Enum.Material.Neon)
		c.Transparency = 0.15
	elseif tipo == "junco" then
		for k = 1, 4 do
			peca(pai, Vector3.new(0.3, R.rnd(3, 5), 0.3), CFrame.new(pos + Vector3.new(R.rnd(-1, 1), 2, R.rnd(-1, 1))) * CFrame.Angles(R.rnd(-0.2, 0.2), 0, R.rnd(-0.2, 0.2)), Color3.fromRGB(110, 130, 70), nil, Enum.Material.Grass)
		end
	end
end

local function letreiro(pai, pos, texto, cor)
	local base = peca(pai, Vector3.new(1, 1, 1), CFrame.new(pos), Color3.new(), nil, nil, false)
	base.Transparency = 1
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.new(0, 360, 0, 60)
	bb.MaxDistance = 220
	bb.Adornee = base
	bb.Parent = base
	local tl = Instance.new("TextLabel")
	tl.Size = UDim2.new(1, 0, 1, 0)
	tl.BackgroundTransparency = 1
	tl.Text = texto
	tl.TextColor3 = cor or Color3.fromRGB(255, 226, 150)
	tl.TextStrokeTransparency = 0.2
	tl.Font = Enum.Font.FredokaOne
	tl.TextScaled = true
	tl.Parent = bb
	return base
end

for i, z in ipairs(D.ZONES) do
	local t = TEMAS[i]
	local c = centro(i)
	local area = Instance.new("Folder")
	area.Name = z.name
	area.Parent = mundo
	local chao = peca(area, Vector3.new(TAM, 4, TAM), CFrame.new(c - Vector3.new(0, 2, 0)), t.chao, nil, (i == 5 and Enum.Material.Sand) or (i == 7 and Enum.Material.Snow) or Enum.Material.Grass, true)
	chao.Name = "Chao"
	-- muros invisíveis para ninguém cair
	for _, lado in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
		local w = peca(area, Vector3.new(lado[1] ~= 0 and 2 or TAM, 40, lado[2] ~= 0 and 2 or TAM), CFrame.new(c + Vector3.new(lado[1] * TAM / 2, 20, lado[2] * TAM / 2)), Color3.new(), nil, nil, true)
		w.Transparency = 1
	end
	-- praça central (lugar seguro, sem monstros)
	peca(area, Vector3.new(26, 0.4, 26), CFrame.new(c + Vector3.new(0, 0.2, 0)) * CFrame.Angles(0, math.rad(45), 0), Color3.fromRGB(176, 160, 132), nil, Enum.Material.Cobblestone, true)
	letreiro(area, c + Vector3.new(0, 14, 0), z.icon .. " " .. z.name .. "  ·  Nv " .. z.min .. "+")
	for _ = 1, 34 do
		local a, d = R.rnd(0, math.pi * 2), R.rnd(24, TAM / 2 - 10)
		criarProp(area, t.prop, c + Vector3.new(math.cos(a) * d, 0, math.sin(a) * d), t)
	end
end

-- ---------- textos flutuantes ----------
local function flutuar(pos, texto, cor, grande)
	local base = Instance.new("Part")
	base.Size = Vector3.new(0.2, 0.2, 0.2)
	base.Transparency = 1
	base.Anchored = true
	base.CanCollide = false
	base.CFrame = CFrame.new(pos + Vector3.new(R.rnd(-1, 1), 0, R.rnd(-1, 1)))
	base.Parent = pastaEfeitos
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.new(0, grande and 260 or 120, 0, grande and 50 or 34)
	bb.AlwaysOnTop = true
	bb.Adornee = base
	bb.Parent = base
	local tl = Instance.new("TextLabel")
	tl.Size = UDim2.new(1, 0, 1, 0)
	tl.BackgroundTransparency = 1
	tl.Text = texto
	tl.TextColor3 = cor
	tl.TextStrokeTransparency = 0.1
	tl.Font = Enum.Font.FredokaOne
	tl.TextScaled = true
	tl.Parent = bb
	TweenService:Create(base, TweenInfo.new(1.1), { CFrame = base.CFrame + Vector3.new(0, 4, 0) }):Play()
	TweenService:Create(tl, TweenInfo.new(1.1, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
	Debris:AddItem(base, 1.2)
end

-- ---------- monstros ----------
local M = {}       -- id -> monstro
local proximoId = 0

local function criarModeloMonstro(nome, cor, variante, escala, chefe)
	local m = Instance.new("Model")
	m.Name = nome
	local s = escala
	local raiz = peca(m, Vector3.new(1, 1, 1), CFrame.new(), cor)
	raiz.Transparency = 1
	raiz.Name = "Raiz"
	m.PrimaryPart = raiz
	local escuro = cor:Lerp(Color3.new(0, 0, 0), 0.35)
	local olho = function(x, y, z)
		peca(m, Vector3.new(0.45, 0.45, 0.45) * s, CFrame.new(x * s, y * s, z * s), Color3.new(1, 1, 1), Enum.PartType.Ball)
		peca(m, Vector3.new(0.22, 0.22, 0.22) * s, CFrame.new(x * s, y * s, (z - 0.18) * s), Color3.new(0.05, 0.05, 0.05), Enum.PartType.Ball)
	end
	if variante == 1 then -- quadrúpede
		peca(m, Vector3.new(1.8, 1.5, 3) * s, CFrame.new(0, 1.6 * s, 0), cor, nil, Enum.Material.Fabric)
		peca(m, Vector3.new(1.5, 1.5, 1.5) * s, CFrame.new(0, 2.3 * s, -1.8 * s), cor, Enum.PartType.Ball, Enum.Material.Fabric)
		olho(-0.35, 2.5, -2.45)
		olho(0.35, 2.5, -2.45)
		for _, q in ipairs({ { -0.6, -1 }, { 0.6, -1 }, { -0.6, 1 }, { 0.6, 1 } }) do
			peca(m, Vector3.new(0.45, 1.1, 0.45) * s, CFrame.new(q[1] * s, 0.55 * s, q[2] * s), escuro)
		end
		peca(m, Vector3.new(0.3, 0.3, 1) * s, CFrame.new(0, 2 * s, 1.8 * s) * CFrame.Angles(-0.6, 0, 0), escuro)
	elseif variante == 2 then -- gosma / bicho redondo
		peca(m, Vector3.new(2.8, 2.3, 2.8) * s, CFrame.new(0, 1.15 * s, 0), cor, Enum.PartType.Ball, Enum.Material.Glass).Transparency = 0.1
		olho(-0.45, 1.6, -1.2)
		olho(0.45, 1.6, -1.2)
		peca(m, Vector3.new(0.25, 1.1, 0.25) * s, CFrame.new(-0.4 * s, 2.6 * s, -0.4 * s) * CFrame.Angles(-0.3, 0, 0.2), escuro)
		peca(m, Vector3.new(0.25, 1.1, 0.25) * s, CFrame.new(0.4 * s, 2.6 * s, -0.4 * s) * CFrame.Angles(-0.3, 0, -0.2), escuro)
	else -- bípede
		peca(m, Vector3.new(1.7, 2, 1.1) * s, CFrame.new(0, 2.6 * s, 0), cor, nil, Enum.Material.Fabric)
		peca(m, Vector3.new(1.6, 1.6, 1.6) * s, CFrame.new(0, 4.3 * s, 0), cor, Enum.PartType.Ball, Enum.Material.Fabric)
		olho(-0.35, 4.45, -0.7)
		olho(0.35, 4.45, -0.7)
		for _, x in ipairs({ -0.45, 0.45 }) do peca(m, Vector3.new(0.6, 1.6, 0.6) * s, CFrame.new(x * s, 0.8 * s, 0), escuro) end
		for _, x in ipairs({ -1.15, 1.15 }) do peca(m, Vector3.new(0.5, 1.8, 0.5) * s, CFrame.new(x * s, 2.6 * s, -0.2 * s) * CFrame.Angles(-0.3, 0, 0), escuro) end
	end
	if chefe then
		local altura = (variante == 3 and 5.3 or variante == 1 and 3.2 or 2.6) * s
		for k = 0, 4 do
			local a = k / 5 * math.pi * 2
			peca(m, Vector3.new(0.35, 0.9, 0.35) * s, CFrame.new(math.cos(a) * 0.55 * s, altura, math.sin(a) * 0.55 * s), Color3.fromRGB(255, 210, 70), nil, Enum.Material.Neon)
		end
	end
	-- nome e barra de vida
	local bb = Instance.new("BillboardGui")
	bb.Name = "Barra"
	bb.Size = UDim2.new(0, chefe and 220 or 140, 0, 38)
	bb.StudsOffset = Vector3.new(0, (variante == 3 and 6 or 4) * s, 0)
	bb.MaxDistance = 120
	bb.Adornee = raiz
	bb.Parent = m
	local nomeL = Instance.new("TextLabel")
	nomeL.Name = "Nome"
	nomeL.Size = UDim2.new(1, 0, 0.55, 0)
	nomeL.BackgroundTransparency = 1
	nomeL.TextColor3 = chefe and Color3.fromRGB(255, 200, 80) or Color3.new(1, 1, 1)
	nomeL.TextStrokeTransparency = 0.3
	nomeL.Font = Enum.Font.FredokaOne
	nomeL.TextScaled = true
	nomeL.Parent = bb
	local fundo = Instance.new("Frame")
	fundo.Size = UDim2.new(1, 0, 0.3, 0)
	fundo.Position = UDim2.new(0, 0, 0.62, 0)
	fundo.BackgroundColor3 = Color3.fromRGB(30, 10, 10)
	fundo.BorderSizePixel = 0
	fundo.Parent = bb
	local cheio = Instance.new("Frame")
	cheio.Name = "Vida"
	cheio.Size = UDim2.new(1, 0, 1, 0)
	cheio.BackgroundColor3 = Color3.fromRGB(220, 50, 40)
	cheio.BorderSizePixel = 0
	cheio.Parent = fundo
	return m, nomeL, cheio
end

local function criarMonstro(zona, pos, chefe)
	local z = D.ZONES[zona]
	local lmin, lmax = R.faixaMapa(zona)
	local variante = math.random(1, 3)
	local nome = chefe and z.boss[1] or z.monsters[variante][1]
	local nivel = chefe and (lmax + 2) or math.random(lmin, lmax)
	local s = R.monstro(nivel, chefe)
	proximoId = proximoId + 1
	local escala = (chefe and 2.2 or 1) * R.rnd(0.9, 1.1)
	local cor = TEMAS[zona].mon:Lerp(Color3.fromHSV(math.random(), 0.5, 0.9), 0.25)
	local modelo, nomeL, vida = criarModeloMonstro(nome, cor, variante, escala, chefe)
	nomeL.Text = "Nv " .. nivel .. "  " .. nome
	modelo:SetAttribute("MonId", proximoId)
	modelo:PivotTo(CFrame.new(pos))
	modelo.Parent = pastaMonstros
	local mon = {
		id = proximoId, nome = nome, zona = zona, s = s, pos = pos, casa = pos, chefe = chefe, escala = escala,
		modelo = modelo, barra = vida, alvo = nil, atkT = R.rnd(0.5, 1.5), stun = 0, slow = 0, danos = {}, dir = Vector3.new(0, 0, -1), passeio = 0,
	}
	M[proximoId] = mon
	return mon
end

local function vivosNoMapa(zona)
	local n, chefe = 0, nil
	for _, m in pairs(M) do
		if m.zona == zona then
			n = n + 1
			if m.chefe then chefe = m end
		end
	end
	return n, chefe
end

-- ---------- jogadores ----------
local P = {} -- player -> estado
local store = nil
pcall(function() store = DataStoreService:GetDataStore("Valdaria_v1") end)

local function aviso(pl, texto, tipo)
	evAviso:FireClient(pl, texto, tipo or "")
end

local function hrp(pl)
	local c = pl.Character
	return c and c:FindFirstChild("HumanoidRootPart")
end

local function ficha(p) return R.ficha(p.h, p.buffs) end

local function enviarFicha(pl)
	local p = P[pl]
	if not p then return end
	if not p.h then
		evFicha:FireClient(pl, nil, nil)
		return
	end
	local f = ficha(p)
	evFicha:FireClient(pl, p.h, { maxHp = f.maxHp, maxMp = f.maxMp, atkMin = f.atkMin, atkMax = f.atkMax, def = f.def, crit = f.crit, critMult = f.critMult, aps = f.aps, evade = f.evade, block = f.block, A = f.A })
	p.sujo = false
end

-- arma simples na mão do herói (cabo + cabeça), conforme o tipo de arma equipada
local function armaNaMao(pl)
	local p = P[pl]
	local c = pl.Character
	if not (p and p.h and c) then return end
	local mao = c:FindFirstChild("RightHand") or c:FindFirstChild("Right Arm")
	if not mao then return end
	local velha = c:FindFirstChild("ArmaValdaria")
	if velha then velha:Destroy() end
	local it = p.h.equip.arma
	local wt = (it and it.wtype) or D.CLASSES[p.h.cls].weapon
	local info = D.WEAPON_INFO[wt] or {}
	local rar = it and R.raridade(it) or D.RARITIES[1]
	local corRar = Color3.fromHex(rar.color)
	local tier = it and R.limitar(math.floor(it.ilvl / 17), 0, 5) or 0
	local metal = ({ Color3.fromRGB(160, 106, 56), Color3.fromRGB(162, 170, 180), Color3.fromRGB(226, 231, 239), Color3.fromRGB(90, 130, 230), Color3.fromRGB(196, 48, 60), Color3.fromRGB(255, 240, 196) })[tier + 1]
	local modelo = Instance.new("Model")
	modelo.Name = "ArmaValdaria"
	local longa = (info.hands == 2) and 1.6 or 1
	local function parte(tam, desloc, cor, forma, neon)
		local x = Instance.new("Part")
		x.Size = tam
		x.Color = cor
		x.Material = neon and Enum.Material.Neon or Enum.Material.Metal
		if forma then x.Shape = forma end
		x.CanCollide = false
		x.Massless = true
		x.CFrame = mao.CFrame * desloc
		x.Parent = modelo
		local w = Instance.new("WeldConstraint")
		w.Part0 = mao
		w.Part1 = x
		w.Parent = x
		return x
	end
	-- a arma aponta para a frente da mão (eixo -Z)
	local cabo = 2.6 * longa
	parte(Vector3.new(0.25, 0.25, cabo), CFrame.new(0, -0.2, -cabo / 2 + 0.6), Color3.fromRGB(70, 50, 40))
	local ponta = CFrame.new(0, -0.2, -cabo + 0.6)
	local anim = info.anim
	if anim == "cast" then
		parte(Vector3.new(0.8, 0.8, 0.8), ponta, corRar, Enum.PartType.Ball, true)
	elseif anim == "bow" or anim == "xbow" then
		parte(Vector3.new(0.2, 2.6 * longa, 0.2), ponta * CFrame.new(0, 0, 0.6), metal)
	elseif wt == "machado" or wt == "machadao" then
		parte(Vector3.new(0.15, 1.2 * longa, 1.0 * longa), ponta * CFrame.new(0, 0.5, 0.4), metal)
	elseif wt == "martelo" or wt == "malho" then
		parte(Vector3.new(0.9, 0.9, 1.4) * longa, ponta * CFrame.new(0, 0, 0.3), metal)
	elseif wt == "foice" then
		parte(Vector3.new(0.12, 0.5, 2.2), ponta * CFrame.new(0, 0.3, 1.0) * CFrame.Angles(0.5, 0, 0), metal)
	else -- espadas, lanças e dardos: lâmina reta
		parte(Vector3.new(0.12, 0.4, 2.2 * longa), ponta * CFrame.new(0, 0, -1.0 * longa), metal)
	end
	if tier >= 3 then parte(Vector3.new(0.35, 0.35, 0.35), ponta, corRar, Enum.PartType.Ball, true) end
	modelo.Parent = c
end

local function posicionar(pl)
	local p = P[pl]
	local raiz = hrp(pl)
	if not (p and p.h and raiz) then return end
	local c = centro(p.h.zone)
	pl.Character:PivotTo(CFrame.new(c + Vector3.new(R.rnd(-6, 6), 5, R.rnd(-6, 6))))
	local hum = pl.Character:FindFirstChildOfClass("Humanoid")
	if hum then hum.WalkSpeed = 22 end
end

local function salvar(pl)
	local p = P[pl]
	if not (p and p.h and store and p.podeSalvar) then return end
	p.h.salvo = os.time()
	local ok, err = pcall(function() store:SetAsync("p_" .. pl.UserId, p.h) end)
	if not ok then warn("Valdária: falha ao salvar", err) end
end

local function carregar(pl)
	local p = { h = nil, buffs = {}, cds = {}, hp = 1, mp = 1, alvo = nil, atkT = 0, morto = 0, furtivo = 0, invocAte = 0, invocMult = 0, reviveCd = 0, potCd = 0, sujo = true, podeSalvar = false }
	P[pl] = p
	if store then
		local ok, dados = pcall(function() return store:GetAsync("p_" .. pl.UserId) end)
		if ok then
			p.podeSalvar = true
			if type(dados) == "table" and dados.cls and D.CLASSES[dados.cls] then p.h = dados end
		else
			task.delay(4, function() aviso(pl, "⚠ O progresso não está sendo salvo. No Studio: Arquivo > Configurações do jogo > Segurança > ative \"Acesso do Studio aos serviços de API\". No jogo publicado salva sozinho.", "ruim") end)
		end
	end
	if p.h then
		local h = p.h
		h.kills = h.kills or {}
		h.pots = h.pots or { hp = 20, mp = 20 }
		h.stats = h.stats or { kills = 0, deaths = 0, bosses = 0 }
		h.inv = h.inv or {}
		if not D.ZONES[h.zone] then h.zone = 1 end
		local f = ficha(p)
		p.hp, p.mp = f.maxHp, f.maxMp
	end
end

local function entrou(pl)
	if P[pl] then return end
	carregar(pl)
	pl.CharacterAdded:Connect(function(char)
		char:WaitForChild("HumanoidRootPart", 10)
		task.wait(0.2)
		posicionar(pl)
		armaNaMao(pl)
	end)
	if pl.Character then
		posicionar(pl)
		armaNaMao(pl)
	end
	enviarFicha(pl)
end
Players.PlayerAdded:Connect(entrou)
for _, pl in ipairs(Players:GetPlayers()) do task.spawn(entrou, pl) end
Players.PlayerRemoving:Connect(function(pl)
	salvar(pl)
	for _, m in pairs(M) do
		m.danos[pl] = nil
		if m.alvo == pl then m.alvo = nil end
	end
	P[pl] = nil
end)
game:BindToClose(function()
	for _, pl in ipairs(Players:GetPlayers()) do salvar(pl) end
end)

evEscolher.OnServerEvent:Connect(function(pl, cls)
	local p = P[pl]
	if not p or p.h or type(cls) ~= "string" or not D.CLASSES[cls] then return end
	p.h = R.novoHeroi(cls)
	local f = ficha(p)
	p.hp, p.mp = f.maxHp, f.maxMp
	posicionar(pl)
	armaNaMao(pl)
	enviarFicha(pl)
	aviso(pl, "Bem-vindo(a) a Valdária, " .. D.CLASSES[cls].name .. "! O modo Auto já está ligado: o herói caça sozinho.", "nivel")
	salvar(pl)
end)

-- ---------- progresso ----------
local function ganharXp(pl, xp)
	local p = P[pl]
	local h = p.h
	if h.lvl >= R.MAX_LEVEL then return end
	h.xp = h.xp + xp
	local subiu = false
	while h.lvl < R.MAX_LEVEL and h.xp >= R.xpNeed(h.lvl) do
		h.xp = h.xp - R.xpNeed(h.lvl)
		h.lvl = h.lvl + 1
		h.pts = h.pts + R.PONTOS_POR_NIVEL
		subiu = true
	end
	if h.lvl >= R.MAX_LEVEL then h.xp = 0 end
	if subiu then
		R.distribuir(h)
		local f = ficha(p)
		p.hp, p.mp = f.maxHp, f.maxMp
		local raiz = hrp(pl)
		if raiz then flutuar(raiz.Position + Vector3.new(0, 4, 0), "NÍVEL " .. h.lvl .. "!", Color3.fromRGB(255, 220, 90), true) end
		aviso(pl, "⭐ Você subiu para o nível " .. h.lvl .. "!", "grande")
		for _, sk in ipairs(D.CLASSES[h.cls].skills) do
			if sk.lvl == h.lvl then aviso(pl, "✨ Nova habilidade: " .. sk.name .. "!", "nivel") end
		end
		local prox = D.ZONES[h.zone + 1]
		if prox and h.lvl == prox.min then aviso(pl, "🗺️ Novo mapa liberado: " .. prox.name .. ". Abra Mapas para ir.", "nivel") end
		p.sujo = true
	end
end

local function receberItem(pl, it)
	local p = P[pl]
	local h = p.h
	local rar = R.raridade(it)
	local atual = h.equip[it.slot]
	local podeEscudo = it.slot ~= "escudo" or not h.equip.arma or R.maoes(h.equip.arma.wtype) == 1
	if R.podeUsar(h.cls, it) and h.lvl >= it.req and podeEscudo and (not atual or R.pontuacao(it) > R.pontuacao(atual)) then
		h.equip[it.slot] = it
		if atual then
			if #h.inv < 40 then table.insert(h.inv, atual) else h.gold = h.gold + R.valor(atual) end
		end
		if it.slot == "arma" and R.maoes(it.wtype) == 2 and h.equip.escudo then
			local e = h.equip.escudo
			h.equip.escudo = nil
			if #h.inv < 40 then table.insert(h.inv, e) else h.gold = h.gold + R.valor(e) end
		end
		aviso(pl, "🎁 Equipado: " .. it.name .. " (" .. rar.name .. ")", "item:" .. rar.color)
		if it.slot == "arma" then armaNaMao(pl) end
	elseif #h.inv < 40 then
		table.insert(h.inv, it)
		aviso(pl, "🎁 Drop: " .. it.name .. " (" .. rar.name .. ")", "item:" .. rar.color)
	else
		h.gold = h.gold + R.valor(it)
		aviso(pl, "Mochila cheia: " .. it.name .. " vendido.", "")
	end
	p.sujo = true
end

local function matar(mon)
	M[mon.id] = nil
	local raizM = mon.modelo.PrimaryPart
	local pos = raizM and raizM.Position or mon.pos
	-- encolhe e some
	for _, x in ipairs(mon.modelo:GetDescendants()) do
		if x:IsA("BasePart") then TweenService:Create(x, TweenInfo.new(0.4), { Transparency = 1 }):Play() end
	end
	Debris:AddItem(mon.modelo, 0.45)
	for pl in pairs(mon.danos) do
		local p = P[pl]
		if p and p.h then
			local h = p.h
			local f = ficha(p)
			local xp = math.floor(mon.s.xp * (1 + (f.xpb or 0) / 100) + 0.5)
			local ouro = math.floor(mon.s.ouro * (1 + (f.goldb or 0) / 100) + 0.5)
			h.gold = h.gold + ouro
			h.stats.kills = h.stats.kills + 1
			local k = tostring(mon.zona)
			if mon.chefe then
				h.stats.bosses = h.stats.bosses + 1
				h.kills[k] = 0
				aviso(pl, "👑 " .. mon.nome .. " derrotado! +" .. xp .. " XP, +" .. ouro .. " ouro.", "grande")
			else
				h.kills[k] = math.min(R.ABATES_CHEFE, (h.kills[k] or 0) + 1)
			end
			flutuar(pos + Vector3.new(0, 3, 0), "+" .. xp .. " XP", Color3.fromRGB(150, 230, 255))
			ganharXp(pl, xp)
			-- cada um tem o seu próprio drop
			local n = mon.chefe and 2 or ((math.random() < 0.16) and 1 or 0)
			for _ = 1, n do receberItem(pl, R.gerarItem(h.cls, mon.s.lvl, mon.chefe and 4 or 1)) end
			if math.random() < (mon.chefe and 1 or 0.05) then
				h.pots.hp = h.pots.hp + 2
				h.pots.mp = h.pots.mp + 2
			end
			p.sujo = true
		end
		if p and p.alvo == mon.id then p.alvo = nil end
	end
end

local function monstrosPerto(zona, pos, raio)
	local lista = {}
	for _, m in pairs(M) do
		if m.zona == zona and (m.pos - pos).Magnitude <= raio then table.insert(lista, m) end
	end
	table.sort(lista, function(a, b) return (a.pos - pos).Magnitude < (b.pos - pos).Magnitude end)
	return lista
end

-- golpe do herói (ataque normal ou habilidade de dano)
local function golpe(pl, mult, sk)
	local p = P[pl]
	local alvo = p.alvo and M[p.alvo]
	if not alvo then return end
	local f = ficha(p)
	local furtivo = p.furtivo > 0
	if not sk and not furtivo then
		local acerto = R.limitar(0.85 + (f.A.des - alvo.s.lvl * 2.5) * 0.003, 0.6, 0.98)
		if math.random() > acerto then
			flutuar(alvo.pos + Vector3.new(0, 4 * alvo.escala, 0), "Errou", Color3.fromRGB(200, 200, 200))
			return
		end
	end
	if furtivo then p.furtivo = 0 end
	local alvos = { alvo }
	if sk and sk.type == "aoe" then alvos = monstrosPerto(alvo.zona, alvo.pos, 13) end
	local limite = (sk and sk.targets) or 99
	local golpes = (sk and sk.hits) or 1
	local total = 0
	for i, t in ipairs(alvos) do
		if i > limite then break end
		local dano = 0
		local critou = false
		for _ = 1, golpes do
			local d = R.rnd(f.atkMin, f.atkMax) * mult / golpes
			if furtivo or math.random() * 100 < f.crit then
				d = d * f.critMult * (furtivo and 1.5 or 1)
				critou = true
			end
			if sk and sk.boss and t.chefe then d = d * (1 + sk.boss) end
			dano = dano + math.max(1, math.floor(d * 100 / (100 + t.s.def) + 0.5))
		end
		-- aliado invocado (falcão, autômato, torreta...) bate junto
		if p.invocAte > os.clock() then dano = dano + math.floor(R.rnd(f.atkMin, f.atkMax) * p.invocMult * 100 / (100 + t.s.def)) end
		t.s.hp = t.s.hp - dano
		t.danos[pl] = true
		if not t.alvo then t.alvo = pl end
		if sk and sk.stun then t.stun = math.max(t.stun, sk.stun) end
		if sk and sk.slow then t.slow = math.max(t.slow, sk.slow) end
		total = total + dano
		flutuar(t.pos + Vector3.new(0, 4 * t.escala, 0), (critou and "CRÍTICO " or "") .. dano, critou and Color3.fromRGB(255, 200, 60) or Color3.new(1, 1, 1), critou)
		if t.s.hp <= 0 then matar(t) end
	end
	if sk and sk.lifesteal and total > 0 then p.hp = math.min(f.maxHp, p.hp + total * sk.lifesteal) end
end

local function buffAtivo(p, id)
	for _, b in ipairs(p.buffs) do if b.id == id then return b end end
	return nil
end
local function addBuff(p, id, stat, val, dur, nome)
	for i = #p.buffs, 1, -1 do
		if p.buffs[i].id == id and p.buffs[i].stat == stat then table.remove(p.buffs, i) end
	end
	table.insert(p.buffs, { id = id, stat = stat, val = val, t = dur, nome = nome })
end

local function habilidade(pl, id, auto)
	local p = P[pl]
	if not (p and p.h) or p.morto > 0 then return false end
	local h = p.h
	local sk = nil
	for _, s in ipairs(D.CLASSES[h.cls].skills) do if s.id == id then sk = s end end
	if not sk or sk.type == "passive" then return false end
	if h.lvl < sk.lvl then
		if not auto then aviso(pl, sk.name .. " libera no nível " .. sk.lvl .. ".", "") end
		return false
	end
	if (p.cds[id] or 0) > 0 then return false end
	if p.mp < sk.mp then
		if not auto then aviso(pl, "Mana insuficiente.", "") end
		return false
	end
	local raiz = hrp(pl)
	if not raiz then return false end
	local f = ficha(p)
	if sk.type == "dmg" or sk.type == "aoe" then
		local alvo = p.alvo and M[p.alvo]
		if not alvo then
			local perto = monstrosPerto(h.zone, raiz.Position, f.alcance + 6)
			if perto[1] then p.alvo = perto[1].id alvo = perto[1] end
		end
		if not alvo or (alvo.pos - raiz.Position).Magnitude > f.alcance + 6 then
			if not auto then aviso(pl, "Nenhum monstro ao alcance.", "") end
			return false
		end
	end
	p.mp = p.mp - sk.mp
	p.cds[id] = sk.cd or 0
	flutuar(raiz.Position + Vector3.new(0, 5, 0), sk.name, Color3.fromRGB(190, 160, 255))
	if sk.type == "dmg" or sk.type == "aoe" then
		golpe(pl, sk.mult, sk)
	elseif sk.type == "heal" then
		for outro, q in pairs(P) do
			local r2 = hrp(outro)
			if q.h and q.morto <= 0 and r2 and (r2.Position - raiz.Position).Magnitude < 35 then
				local fq = ficha(q)
				local cura = math.floor(fq.maxHp * sk.mult)
				q.hp = math.min(fq.maxHp, q.hp + cura)
				flutuar(r2.Position + Vector3.new(0, 3, 0), "+" .. cura, Color3.fromRGB(110, 255, 140))
			end
		end
	elseif sk.type == "buff" then
		addBuff(p, sk.id, sk.stat, sk.val, sk.dur, sk.name)
		if sk.also then addBuff(p, sk.id, sk.also.stat, sk.also.val, sk.dur, sk.name) end
	elseif sk.type == "summon" or sk.type == "turret" then
		p.invocAte = os.clock() + sk.dur
		p.invocMult = sk.mult
	elseif sk.type == "stealth" then
		p.furtivo = sk.dur
	end
	return true
end

local function usarPocao(pl, tipo)
	local p = P[pl]
	if not (p and p.h) or p.morto > 0 or p.potCd > 0 then return end
	local h = p.h
	if (h.pots[tipo] or 0) <= 0 then
		local preco = 10 + h.lvl * 4
		if h.gold < preco * 5 then return end
		h.gold = h.gold - preco * 5
		h.pots[tipo] = 5
		aviso(pl, "🧪 Comprou 5 poções de " .. (tipo == "hp" and "vida" or "mana") .. " (" .. preco * 5 .. " ouro).", "")
	end
	local f = ficha(p)
	h.pots[tipo] = h.pots[tipo] - 1
	p.potCd = 1.5
	if tipo == "hp" then p.hp = math.min(f.maxHp, p.hp + f.maxHp * 0.35) else p.mp = math.min(f.maxMp, p.mp + f.maxMp * 0.4) end
end

evAcao.OnServerEvent:Connect(function(pl, tipo, arg)
	local p = P[pl]
	if not p then return end
	if tipo == "pronto" then enviarFicha(pl) return end
	if not p.h then return end
	local h = p.h
	if tipo == "alvo" and type(arg) == "number" and M[arg] and M[arg].zona == h.zone then
		p.alvo = arg
	elseif tipo == "habilidade" and type(arg) == "string" then
		habilidade(pl, arg, false)
	elseif tipo == "auto" then
		h.auto = not h.auto
		if not h.auto then p.alvo = nil end
		p.sujo = true
	elseif tipo == "pocao" and (arg == "hp" or arg == "mp") then
		usarPocao(pl, arg)
	elseif tipo == "mapa" and type(arg) == "number" and D.ZONES[arg] then
		if h.lvl < D.ZONES[arg].min then
			aviso(pl, D.ZONES[arg].name .. " libera no nível " .. D.ZONES[arg].min .. ".", "")
			return
		end
		h.zone = arg
		p.alvo = nil
		posicionar(pl)
		aviso(pl, "🗺️ Você chegou a " .. D.ZONES[arg].name .. ".", "nivel")
		p.sujo = true
	elseif tipo == "chefe" then
		local k = tostring(h.zone)
		local _, vivo = vivosNoMapa(h.zone)
		if vivo then aviso(pl, "O chefe já está no mapa!", "") return end
		if (h.kills[k] or 0) < R.ABATES_CHEFE then
			aviso(pl, "Derrote " .. R.ABATES_CHEFE .. " monstros deste mapa para chamar o chefe.", "")
			return
		end
		local raiz = hrp(pl)
		local base = raiz and raiz.Position or centro(h.zone)
		local mon = criarMonstro(h.zone, Vector3.new(base.X + 14, 0, base.Z), true)
		mon.alvo = pl
		p.alvo = mon.id
		h.kills[k] = 0
		aviso(pl, "👑 " .. mon.nome .. " apareceu!", "grande")
		p.sujo = true
	elseif tipo == "equipar" and type(arg) == "string" then
		for i, it in ipairs(h.inv) do
			if it.uid == arg then
				if not R.podeUsar(h.cls, it) then aviso(pl, "Sua classe não usa esse item.", "") return end
				if h.lvl < it.req then aviso(pl, "Requer nível " .. it.req .. ".", "") return end
				if it.slot == "escudo" and h.equip.arma and R.maoes(h.equip.arma.wtype) == 2 then aviso(pl, "Escudo só com arma de uma mão.", "") return end
				table.remove(h.inv, i)
				local velho = h.equip[it.slot]
				h.equip[it.slot] = it
				if velho then table.insert(h.inv, velho) end
				if it.slot == "arma" and R.maoes(it.wtype) == 2 and h.equip.escudo then
					table.insert(h.inv, h.equip.escudo)
					h.equip.escudo = nil
				end
				if it.slot == "arma" then armaNaMao(pl) end
				p.sujo = true
				return
			end
		end
	elseif tipo == "vender" and type(arg) == "string" then
		for i, it in ipairs(h.inv) do
			if it.uid == arg then
				table.remove(h.inv, i)
				h.gold = h.gold + R.valor(it)
				p.sujo = true
				return
			end
		end
	elseif tipo == "vendercomuns" then
		local total = 0
		for i = #h.inv, 1, -1 do
			local it = h.inv[i]
			if it.rarity == "comum" or it.rarity == "magico" then
				total = total + R.valor(it)
				table.remove(h.inv, i)
			end
		end
		h.gold = h.gold + total
		aviso(pl, "Itens vendidos por " .. total .. " ouro.", "")
		p.sujo = true
	end
end)

-- ---------- ciclo do jogo (10 vezes por segundo) ----------
local function ataqueDoMonstro(mon, pl)
	local p = P[pl]
	local raiz = hrp(pl)
	if not (p and p.h and raiz) then return end
	local f = ficha(p)
	local acima = raiz.Position + Vector3.new(0, 3, 0)
	if p.furtivo > 0 or math.random() < f.evade then
		flutuar(acima, "Esquiva", Color3.fromRGB(200, 200, 200))
		return
	end
	if math.random() < f.block then
		flutuar(acima, "Bloqueio", Color3.fromRGB(150, 200, 255))
		return
	end
	local dano = math.max(1, math.floor(mon.s.atk * R.rnd(0.85, 1.15) * 150 / (150 + f.def) * (1 - f.absorb) + 0.5))
	if f.mshield > 0 then
		local daMana = math.min(p.mp, dano * f.mshield)
		p.mp = p.mp - daMana
		dano = math.floor(dano - daMana)
	end
	if f.reflect > 0 then
		mon.s.hp = mon.s.hp - math.floor(dano * f.reflect)
		mon.danos[pl] = true
	end
	p.hp = p.hp - dano
	flutuar(acima, "-" .. dano, Color3.fromRGB(255, 90, 80))
	if mon.s.hp <= 0 then matar(mon) end
	if p.hp <= 0 then
		local h = p.h
		local revive = nil
		for _, sk in ipairs(D.CLASSES[h.cls].skills) do if sk.revive and h.lvl >= sk.lvl then revive = sk end end
		if revive and p.reviveCd <= 0 then
			p.hp = f.maxHp * 0.6
			p.reviveCd = revive.revive
			flutuar(acima, "RESSURREIÇÃO!", Color3.fromRGB(255, 240, 150), true)
			return
		end
		p.hp = 0
		p.morto = 4
		p.alvo = nil
		h.stats.deaths = h.stats.deaths + 1
		aviso(pl, "💀 Você caiu! Volta em 4 segundos (sem perder nada).", "ruim")
		for _, m in pairs(M) do if m.alvo == pl then m.alvo = nil end end
	end
end

local function tickMonstro(mon, dt)
	if mon.stun > 0 then mon.stun = mon.stun - dt return end
	if mon.slow > 0 then mon.slow = mon.slow - dt end
	-- alvo
	local pl = mon.alvo
	local p = pl and P[pl]
	local raiz = pl and hrp(pl)
	if not (p and p.h and p.morto <= 0 and raiz and p.h.zone == mon.zona and (raiz.Position - mon.pos).Magnitude < 50) then
		mon.alvo = nil
		pl, raiz = nil, nil
		local visao = mon.chefe and 32 or 14
		for outro, q in pairs(P) do
			local r2 = hrp(outro)
			if q.h and q.morto <= 0 and r2 and q.h.zone == mon.zona and q.furtivo <= 0 and (r2.Position - mon.pos).Magnitude < visao then
				mon.alvo, pl, raiz = outro, outro, r2
				break
			end
		end
	end
	local vel = (mon.chefe and 9 or 8) * (mon.slow > 0 and 0.5 or 1)
	if raiz then
		local alvoPos = Vector3.new(raiz.Position.X, 0, raiz.Position.Z)
		local delta = alvoPos - mon.pos
		local dist = delta.Magnitude
		if dist > 0.1 then mon.dir = delta.Unit end
		local alcance = 3.5 * mon.escala
		if dist > alcance then
			mon.pos = mon.pos + mon.dir * math.min(dist - alcance + 0.1, vel * dt)
		else
			mon.atkT = mon.atkT - dt
			if mon.atkT <= 0 then
				mon.atkT = mon.chefe and 1.4 or 1.8
				ataqueDoMonstro(mon, pl)
				if not M[mon.id] then return end
			end
		end
	else
		-- passeia perto de onde nasceu
		mon.passeio = mon.passeio - dt
		if mon.passeio <= 0 then
			mon.passeio = R.rnd(2, 5)
			local a = R.rnd(0, math.pi * 2)
			mon.destino = mon.casa + Vector3.new(math.cos(a) * R.rnd(0, 10), 0, math.sin(a) * R.rnd(0, 10))
		end
		if mon.destino then
			local delta = mon.destino - mon.pos
			if delta.Magnitude > 0.5 then
				mon.dir = delta.Unit
				mon.pos = mon.pos + mon.dir * math.min(delta.Magnitude, 3 * dt)
			end
		end
	end
	mon.modelo:PivotTo(CFrame.lookAt(mon.pos, mon.pos + mon.dir))
	mon.barra.Size = UDim2.new(math.max(0, mon.s.hp / mon.s.maxHp), 0, 1, 0)
end

local function autoHabilidades(pl, p, f)
	local h = p.h
	local hpPct = p.hp / f.maxHp
	for _, sk in ipairs(D.CLASSES[h.cls].skills) do
		if h.lvl >= sk.lvl and sk.type ~= "passive" and (p.cds[sk.id] or 0) <= 0 and p.mp >= sk.mp then
			local usar = false
			if sk.type == "heal" then usar = hpPct < 0.6
			elseif sk.type == "buff" then usar = p.alvo ~= nil and not buffAtivo(p, sk.id)
			elseif sk.type == "summon" or sk.type == "turret" then usar = p.alvo ~= nil and p.invocAte <= os.clock()
			elseif sk.type == "stealth" then usar = hpPct < 0.4
			else usar = p.alvo ~= nil and (p.mp - sk.mp) > f.maxMp * 0.15 end
			if usar and habilidade(pl, sk.id, true) then return end
		end
	end
end

local function tickJogador(pl, p, dt)
	local h = p.h
	local f = ficha(p)
	for k, v in pairs(p.cds) do p.cds[k] = math.max(0, v - dt) end
	for i = #p.buffs, 1, -1 do
		p.buffs[i].t = p.buffs[i].t - dt
		if p.buffs[i].t <= 0 then table.remove(p.buffs, i) end
	end
	if p.potCd > 0 then p.potCd = p.potCd - dt end
	if p.reviveCd > 0 then p.reviveCd = p.reviveCd - dt end
	if p.furtivo > 0 then p.furtivo = p.furtivo - dt end
	if p.morto > 0 then
		p.morto = p.morto - dt
		if p.morto <= 0 then
			p.hp, p.mp = f.maxHp, f.maxMp
			posicionar(pl)
		end
		return
	end
	p.hp = math.min(f.maxHp, p.hp + f.hpRegen * dt)
	p.mp = math.min(f.maxMp, p.mp + f.mpRegen * dt)
	local raiz = hrp(pl)
	local hum = pl.Character and pl.Character:FindFirstChildOfClass("Humanoid")
	if not (raiz and hum) then return end
	-- poções automáticas
	if p.hp < f.maxHp * 0.45 then usarPocao(pl, "hp") end
	if p.mp < f.maxMp * 0.25 then usarPocao(pl, "mp") end
	-- alvo
	local alvo = p.alvo and M[p.alvo]
	if alvo and (alvo.zona ~= h.zone or (alvo.pos - raiz.Position).Magnitude > 80) then
		p.alvo, alvo = nil, nil
	end
	if not alvo and h.auto then
		local perto = monstrosPerto(h.zone, raiz.Position, 90)
		if perto[1] then p.alvo, alvo = perto[1].id, perto[1] end
	end
	if not alvo then return end
	-- quem anda até o alvo é a interface (o personagem pertence ao jogador); aqui só se ataca quando está perto
	local plano = Vector3.new(raiz.Position.X, 0, raiz.Position.Z)
	local dist = (alvo.pos - plano).Magnitude
	if dist <= f.alcance + 2 then
		if h.auto then autoHabilidades(pl, p, f) end
		if not M[alvo.id] then return end
		p.atkT = p.atkT - dt
		if p.atkT <= 0 then
			p.atkT = 1 / f.aps
			golpe(pl, 1, nil)
		end
	end
end

local function enviarEstado(pl, p)
	local h = p.h
	local f = ficha(p)
	local alvo = p.alvo and M[p.alvo]
	local buffs = {}
	for _, b in ipairs(p.buffs) do table.insert(buffs, { nome = b.nome, t = math.ceil(b.t) }) end
	local _, chefe = vivosNoMapa(h.zone)
	evEstado:FireClient(pl, {
		hp = math.floor(p.hp), maxHp = f.maxHp, mp = math.floor(p.mp), maxMp = f.maxMp,
		xp = h.xp, need = R.xpNeed(h.lvl), lvl = h.lvl, gold = h.gold, zone = h.zone, auto = h.auto,
		cds = p.cds, buffs = buffs, pots = h.pots, morto = p.morto, kills = h.kills[tostring(h.zone)] or 0,
		chefeVivo = chefe ~= nil, invoc = math.max(0, math.ceil(p.invocAte - os.clock())),
		alcance = f.alcance,
		alvo = alvo and { nome = alvo.nome, lvl = alvo.s.lvl, hp = math.max(0, alvo.s.hp), maxHp = alvo.s.maxHp, chefe = alvo.chefe, x = alvo.pos.X, z = alvo.pos.Z } or nil,
	})
end

local acum, envio, salvarT, nasceT = 0, 0, 0, 0
game:GetService("RunService").Heartbeat:Connect(function(passo)
	acum = acum + passo
	if acum < 0.1 then return end
	local dt = math.min(acum, 0.3)
	acum = 0
	-- monstros nascem só nos mapas com jogadores
	nasceT = nasceT - dt
	if nasceT <= 0 then
		nasceT = 0.8
		local mapas = {}
		for _, p in pairs(P) do if p.h then mapas[p.h.zone] = true end end
		for zona in pairs(mapas) do
			if vivosNoMapa(zona) < 12 then
				local a, d = R.rnd(0, math.pi * 2), R.rnd(22, TAM / 2 - 14)
				criarMonstro(zona, centro(zona) + Vector3.new(math.cos(a) * d, 0, math.sin(a) * d), false)
			end
		end
	end
	for _, mon in pairs(M) do
		if M[mon.id] then tickMonstro(mon, dt) end
	end
	for pl, p in pairs(P) do
		if p.h then tickJogador(pl, p, dt) end
	end
	envio = envio + dt
	if envio >= 0.2 then
		envio = 0
		for pl, p in pairs(P) do
			if p.h then
				enviarEstado(pl, p)
				if p.sujo then enviarFicha(pl) end
			end
		end
	end
	salvarT = salvarT + dt
	if salvarT >= 60 then
		salvarT = 0
		for pl in pairs(P) do task.spawn(salvar, pl) end
	end
end)

print("Crônicas de Valdária: servidor pronto.")
