-- Crônicas de Valdária (Roblox) — interface: escolha de classe, barras, habilidades, alvo, mapas, herói e mochila.
local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local UIS = game:GetService("UserInputService")
local StarterGui = game:GetService("StarterGui")

local pl = Players.LocalPlayer
local D = require(RS:WaitForChild("Dados"))
local R = require(RS:WaitForChild("Regras"))
local rem = RS:WaitForChild("Remotos")
local evEscolher = rem:WaitForChild("Escolher")
local evAcao = rem:WaitForChild("Acao")
local evEstado = rem:WaitForChild("Estado")
local evFicha = rem:WaitForChild("Ficha")
local evAviso = rem:WaitForChild("Aviso")

pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)
end)

-- ---------- tema "Lendas": madeira e ouro ----------
local COR = {
	madeira = Color3.fromRGB(64, 42, 26), madeira2 = Color3.fromRGB(34, 22, 14),
	ouro = Color3.fromRGB(236, 194, 98), ouroEsc = Color3.fromRGB(140, 100, 42),
	texto = Color3.fromRGB(242, 228, 192), apagado = Color3.fromRGB(170, 152, 120),
	vida = Color3.fromRGB(214, 52, 44), mana = Color3.fromRGB(60, 120, 230), xp = Color3.fromRGB(240, 200, 70),
}

local gui = Instance.new("ScreenGui")
gui.Name = "Valdaria"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = pl:WaitForChild("PlayerGui")

local function novo(classe, props, pai)
	local o = Instance.new(classe)
	for k, v in pairs(props) do o[k] = v end
	if pai then o.Parent = pai end
	return o
end
local function cantos(o, r) novo("UICorner", { CornerRadius = UDim.new(0, r or 8) }, o) end
local function borda(o, cor, esp) novo("UIStroke", { Color = cor or COR.ouroEsc, Thickness = esp or 2, ApplyStrokeMode = Enum.ApplyStrokeMode.Border }, o) end
local function painel(pai, tam, pos, anc)
	local f = novo("Frame", { Size = tam, Position = pos, AnchorPoint = anc or Vector2.new(0, 0), BackgroundColor3 = COR.madeira, BorderSizePixel = 0 }, pai)
	cantos(f, 10)
	borda(f, COR.ouroEsc, 2)
	novo("UIGradient", { Color = ColorSequence.new(Color3.new(1, 1, 1), Color3.fromRGB(150, 140, 130)), Rotation = 90 }, f)
	return f
end
local function texto(pai, props)
	props.BackgroundTransparency = 1
	props.Font = props.Font or Enum.Font.GothamMedium
	props.TextColor3 = props.TextColor3 or COR.texto
	if props.TextScaled == nil and not props.TextSize then props.TextSize = 14 end
	local t = novo("TextLabel", props, pai)
	return t
end
local function botao(pai, txt, tam, pos, cb, dourado)
	local b = novo("TextButton", {
		Size = tam, Position = pos, Text = txt, Font = Enum.Font.FredokaOne, TextScaled = true,
		TextColor3 = dourado and Color3.fromRGB(46, 26, 8) or COR.texto,
		BackgroundColor3 = dourado and COR.ouro or Color3.fromRGB(104, 70, 38), AutoButtonColor = true, BorderSizePixel = 0,
	}, pai)
	cantos(b, 8)
	borda(b, dourado and Color3.fromRGB(255, 238, 172) or COR.ouroEsc, 2)
	novo("UITextSizeConstraint", { MaxTextSize = 20 }, b)
	novo("UIPadding", { PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6), PaddingTop = UDim.new(0, 3), PaddingBottom = UDim.new(0, 3) }, b)
	if cb then b.Activated:Connect(cb) end
	return b
end
local function barra(pai, pos, tam, cor)
	local f = novo("Frame", { Position = pos, Size = tam, BackgroundColor3 = Color3.fromRGB(22, 12, 8), BorderSizePixel = 0 }, pai)
	cantos(f, 6)
	borda(f, COR.ouroEsc, 1)
	local c = novo("Frame", { Size = UDim2.new(1, 0, 1, 0), BackgroundColor3 = cor, BorderSizePixel = 0 }, f)
	cantos(c, 6)
	novo("UIGradient", { Color = ColorSequence.new(Color3.new(1, 1, 1), Color3.fromRGB(170, 170, 170)), Rotation = 90 }, c)
	local t = texto(f, { Size = UDim2.new(1, 0, 1, 0), Text = "", TextScaled = true, Font = Enum.Font.GothamBold, ZIndex = 3, TextStrokeTransparency = 0.4 })
	novo("UITextSizeConstraint", { MaxTextSize = 13 }, t)
	return { cheio = c, txt = t }
end
local function setBarra(b, v, max, txt)
	b.cheio.Size = UDim2.new(math.clamp(v / math.max(1, max), 0, 1), 0, 1, 0)
	b.txt.Text = txt
end
local function fmt(n)
	n = math.floor(n)
	if n >= 1e6 then return string.format("%.1fM", n / 1e6) end
	if n >= 1e4 then return string.format("%.1fK", n / 1e3) end
	return tostring(n)
end
local function limpar(f)
	for _, c in ipairs(f:GetChildren()) do
		if c:IsA("GuiObject") then c:Destroy() end
	end
end

-- ---------- estado recebido do servidor ----------
local H, F, E = nil, nil, nil -- herói, ficha (atributos), estado rápido

-- =====================================================================
-- Tela de escolha de classe (com a história, armas e habilidades de cada uma)
-- =====================================================================
local escolha = novo("Frame", { Size = UDim2.new(1, 0, 1, 0), BackgroundColor3 = Color3.fromRGB(20, 12, 8), Visible = false, ZIndex = 20 }, gui)
novo("UIGradient", { Color = ColorSequence.new(Color3.fromRGB(110, 50, 24), Color3.fromRGB(16, 10, 6)), Rotation = 90 }, escolha)
texto(escolha, { Size = UDim2.new(1, 0, 0, 50), Position = UDim2.new(0, 0, 0, 12), Text = "Crônicas de Valdária", Font = Enum.Font.FredokaOne, TextScaled = true, TextColor3 = COR.ouro, ZIndex = 21 })
local listaClasses = novo("Frame", { Size = UDim2.new(1, -24, 0, 132), Position = UDim2.new(0, 12, 0, 70), BackgroundTransparency = 1, ZIndex = 21 }, escolha)
novo("UIGridLayout", { CellSize = UDim2.new(0.25, -6, 0, 62), CellPadding = UDim2.new(0, 6, 0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, listaClasses)
local detalhe = painel(escolha, UDim2.new(1, -24, 1, -290), UDim2.new(0, 12, 0, 212))
detalhe.ZIndex = 21
local rolagem = novo("ScrollingFrame", { Size = UDim2.new(1, -16, 1, -16), Position = UDim2.new(0, 8, 0, 8), BackgroundTransparency = 1, BorderSizePixel = 0, ScrollBarThickness = 6, AutomaticCanvasSize = Enum.AutomaticSize.Y, CanvasSize = UDim2.new(), ZIndex = 22 }, detalhe)
novo("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, rolagem)
local botaoComecar = botao(escolha, "Começar", UDim2.new(0.6, 0, 0, 52), UDim2.new(0.2, 0, 1, -66), nil, true)
botaoComecar.ZIndex = 22
local clsEscolhida = D.ORDEM_CLASSES[1]

local function linhaTexto(txt, tam, cor, fonte, ordem)
	local t = texto(rolagem, { Size = UDim2.new(1, -8, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, Text = txt, TextWrapped = true, TextXAlignment = Enum.TextXAlignment.Left, TextSize = tam, TextColor3 = cor or COR.texto, Font = fonte or Enum.Font.Gotham, RichText = true, LayoutOrder = ordem, ZIndex = 23 })
	return t
end

local function mostrarClasse(cls)
	clsEscolhida = cls
	local c = D.CLASSES[cls]
	local fac = D.FACTIONS[c.faction]
	for _, b in ipairs(listaClasses:GetChildren()) do
		if b:IsA("TextButton") then
			local st = b:FindFirstChildOfClass("UIStroke")
			if st then st.Color = (b.Name == cls) and Color3.fromRGB(255, 236, 160) or COR.ouroEsc st.Thickness = (b.Name == cls) and 3 or 2 end
		end
	end
	limpar(rolagem)
	local o = 0
	local function prox() o = o + 1 return o end
	linhaTexto(c.icon .. "  " .. c.name, 30, COR.ouro, Enum.Font.FredokaOne, prox())
	linhaTexto((c.role or "") .. "  ·  " .. fac.name, 15, COR.apagado, Enum.Font.GothamMedium, prox())
	linhaTexto("📜 <b>História</b>", 18, COR.ouro, Enum.Font.GothamBold, prox())
	linhaTexto(D.CLASS_LORE[cls] or c.desc, 15, nil, nil, prox())
	linhaTexto("<i>" .. (fac.lore or fac.desc) .. "</i>", 13, COR.apagado, nil, prox())
	linhaTexto("⚔️ <b>Como joga</b>", 18, COR.ouro, Enum.Font.GothamBold, prox())
	linhaTexto(c.desc, 15, nil, nil, prox())
	local attr = {}
	for _, k in ipairs(R.ATRIBUTOS) do table.insert(attr, R.NOME_ATRIBUTO[k] .. " " .. c.base[k]) end
	linhaTexto(table.concat(attr, "  ·  "), 13, COR.apagado, nil, prox())
	local a1, a2 = D.WEAPON_INFO[c.weapon], D.WEAPON_INFO[c.weapon2]
	linhaTexto("🎒 <b>Armas:</b> " .. a1.plural .. (a1.hands == 1 and " (com escudo)" or " (duas mãos)") .. (a2 and (" e " .. a2.plural .. (a2.hands == 1 and " (com escudo)" or " (duas mãos)")) or ""), 15, nil, nil, prox())
	linhaTexto("✨ <b>Habilidades</b>", 18, COR.ouro, Enum.Font.GothamBold, prox())
	for _, sk in ipairs(c.skills) do
		linhaTexto("<font color=\"#ecc262\">Nv " .. sk.lvl .. "  " .. sk.name .. "</font>  " .. R.textoHabilidade(sk), 14, nil, nil, prox())
	end
	botaoComecar.Text = "Começar como " .. c.name
end

for i, cls in ipairs(D.ORDEM_CLASSES) do
	local c = D.CLASSES[cls]
	local b = botao(listaClasses, c.icon .. " " .. c.name, UDim2.new(), UDim2.new(), function() mostrarClasse(cls) end)
	b.Name = cls
	b.LayoutOrder = i
	b.ZIndex = 22
	b.BackgroundColor3 = Color3.fromHex(D.FACTIONS[c.faction].color):Lerp(Color3.fromRGB(60, 40, 24), 0.65)
end
botaoComecar.Activated:Connect(function()
	evEscolher:FireServer(clsEscolhida)
	botaoComecar.Text = "Entrando..."
end)

-- =====================================================================
-- HUD
-- =====================================================================
local hud = novo("Frame", { Size = UDim2.new(1, 0, 1, 0), BackgroundTransparency = 1, Visible = false }, gui)

-- herói (canto superior esquerdo)
local cartao = painel(hud, UDim2.new(0, 290, 0, 104), UDim2.new(0, 10, 0, 44))
local nomeL = texto(cartao, { Size = UDim2.new(1, -16, 0, 22), Position = UDim2.new(0, 8, 0, 4), Text = "", Font = Enum.Font.FredokaOne, TextSize = 18, TextColor3 = COR.ouro, TextXAlignment = Enum.TextXAlignment.Left })
local bVida = barra(cartao, UDim2.new(0, 8, 0, 30), UDim2.new(1, -16, 0, 18), COR.vida)
local bMana = barra(cartao, UDim2.new(0, 8, 0, 52), UDim2.new(1, -16, 0, 14), COR.mana)
local ouroL = texto(cartao, { Size = UDim2.new(1, -16, 0, 20), Position = UDim2.new(0, 8, 0, 72), Text = "", TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left, RichText = true })
local buffsL = texto(hud, { Size = UDim2.new(0, 290, 0, 18), Position = UDim2.new(0, 12, 0, 150), Text = "", TextSize = 12, TextColor3 = Color3.fromRGB(190, 240, 170), TextXAlignment = Enum.TextXAlignment.Left, TextStrokeTransparency = 0.5 })

-- alvo (topo, centro)
local alvoP = painel(hud, UDim2.new(0, 300, 0, 50), UDim2.new(0.5, 0, 0, 44), Vector2.new(0.5, 0))
local alvoNome = texto(alvoP, { Size = UDim2.new(1, -12, 0, 20), Position = UDim2.new(0, 6, 0, 3), Text = "", Font = Enum.Font.FredokaOne, TextSize = 16 })
local bAlvo = barra(alvoP, UDim2.new(0, 8, 0, 26), UDim2.new(1, -16, 0, 16), COR.vida)

-- XP (rodapé inteiro)
local bXp = barra(hud, UDim2.new(0, 0, 1, -16), UDim2.new(1, 0, 0, 16), COR.xp)

-- habilidades e poções (rodapé, centro)
local barraHab = novo("Frame", { Size = UDim2.new(0, 8 * 66, 0, 70), Position = UDim2.new(0.5, 0, 1, -24), AnchorPoint = Vector2.new(0.5, 1), BackgroundTransparency = 1 }, hud)
novo("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 4), HorizontalAlignment = Enum.HorizontalAlignment.Center }, barraHab)
novo("UIScale", { Name = "Escala" }, barraHab)
local slots = {}
local function criarSlot(i)
	local b = novo("TextButton", { Size = UDim2.new(0, 62, 0, 62), BackgroundColor3 = Color3.fromRGB(46, 30, 18), Text = "", AutoButtonColor = true, LayoutOrder = i }, barraHab)
	cantos(b, 8)
	borda(b, COR.ouroEsc, 2)
	local nome = texto(b, { Size = UDim2.new(1, -4, 1, -16), Position = UDim2.new(0, 2, 0, 2), Text = "", TextScaled = true, TextWrapped = true, Font = Enum.Font.GothamBold, TextStrokeTransparency = 0.5 })
	novo("UITextSizeConstraint", { MaxTextSize = 12 }, nome)
	local tecla = texto(b, { Size = UDim2.new(1, -4, 0, 14), Position = UDim2.new(0, 2, 1, -15), Text = "", TextSize = 11, TextColor3 = COR.ouro, TextXAlignment = Enum.TextXAlignment.Left })
	local cd = texto(b, { Size = UDim2.new(1, 0, 1, 0), Text = "", Font = Enum.Font.FredokaOne, TextSize = 24, BackgroundTransparency = 0.45, BackgroundColor3 = Color3.new(0, 0, 0), ZIndex = 3, Visible = false })
	cd.BackgroundTransparency = 0.45
	cantos(cd, 8)
	slots[i] = { b = b, nome = nome, tecla = tecla, cd = cd }
	return slots[i]
end
for i = 1, 8 do criarSlot(i) end
for i = 1, 6 do
	slots[i].tecla.Text = tostring(i)
	slots[i].b.Activated:Connect(function()
		local sk = H and D.CLASSES[H.cls].skills[i]
		if sk then evAcao:FireServer("habilidade", sk.id) end
	end)
end
slots[7].tecla.Text = "Q"
slots[8].tecla.Text = "E"
slots[7].b.BackgroundColor3 = Color3.fromRGB(110, 26, 24)
slots[8].b.BackgroundColor3 = Color3.fromRGB(26, 44, 110)
slots[7].b.Activated:Connect(function() evAcao:FireServer("pocao", "hp") end)
slots[8].b.Activated:Connect(function() evAcao:FireServer("pocao", "mp") end)

-- botões da direita
local colDir = novo("Frame", { Size = UDim2.new(0, 130, 0, 4 * 46), Position = UDim2.new(1, -10, 0, 44), AnchorPoint = Vector2.new(1, 0), BackgroundTransparency = 1 }, hud)
novo("UIListLayout", { Padding = UDim.new(0, 6) }, colDir)
local bAuto = botao(colDir, "🤖 Auto: ON", UDim2.new(1, 0, 0, 40), UDim2.new(), function() evAcao:FireServer("auto") end)
local janelaAberta = nil
local abrirJanela -- definida abaixo
local bMapas = botao(colDir, "🗺️ Mapas", UDim2.new(1, 0, 0, 40), UDim2.new(), function() abrirJanela("mapas") end)
local bChefe = botao(colDir, "👑 Chefe", UDim2.new(1, 0, 0, 40), UDim2.new(), function() evAcao:FireServer("chefe") end)
local bHeroi = botao(colDir, "🧙 Herói", UDim2.new(1, 0, 0, 40), UDim2.new(), function() abrirJanela("heroi") end)

-- registro (canto inferior esquerdo)
local registro = novo("Frame", { Size = UDim2.new(0, 360, 0, 120), Position = UDim2.new(0, 10, 1, -24), AnchorPoint = Vector2.new(0, 1), BackgroundTransparency = 1 }, hud)
novo("UIListLayout", { VerticalAlignment = Enum.VerticalAlignment.Bottom, SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 1) }, registro)
local nLog = 0
local function addLog(txt, cor)
	nLog = nLog + 1
	local t = texto(registro, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, Text = txt, RichText = true, TextWrapped = true, TextSize = 13, TextColor3 = cor or COR.texto, TextXAlignment = Enum.TextXAlignment.Left, TextStrokeTransparency = 0.35, LayoutOrder = nLog })
	local filhos = {}
	for _, c in ipairs(registro:GetChildren()) do if c:IsA("TextLabel") then table.insert(filhos, c) end end
	if #filhos > 6 then
		table.sort(filhos, function(a, b) return a.LayoutOrder < b.LayoutOrder end)
		for i = 1, #filhos - 6 do filhos[i]:Destroy() end
	end
	return t
end

-- aviso grande no centro
local aviso = texto(hud, { Size = UDim2.new(0.8, 0, 0, 50), Position = UDim2.new(0.1, 0, 0.26, 0), Text = "", Font = Enum.Font.FredokaOne, TextScaled = true, TextColor3 = COR.ouro, TextStrokeTransparency = 0.2, Visible = false })
local avisoN = 0
local function avisoGrande(txt)
	avisoN = avisoN + 1
	local n = avisoN
	aviso.Text = txt
	aviso.Visible = true
	task.delay(2.6, function() if avisoN == n then aviso.Visible = false end end)
end

-- tela de morte
local mortoL = texto(hud, { Size = UDim2.new(1, 0, 0, 60), Position = UDim2.new(0, 0, 0.4, 0), Text = "", Font = Enum.Font.FredokaOne, TextScaled = true, TextColor3 = Color3.fromRGB(255, 90, 80), TextStrokeTransparency = 0.2, Visible = false })

-- =====================================================================
-- Janelas (Mapas e Herói)
-- =====================================================================
local janela = painel(hud, UDim2.new(0, 520, 0, 420), UDim2.new(0.5, 0, 0.5, 0), Vector2.new(0.5, 0.5))
janela.Visible = false
janela.ZIndex = 10
novo("UISizeConstraint", { MaxSize = Vector2.new(560, 460) }, janela)
local tituloJ = novo("Frame", { Size = UDim2.new(1, 0, 0, 40), BackgroundColor3 = Color3.fromRGB(150, 34, 28), BorderSizePixel = 0, ZIndex = 11 }, janela)
cantos(tituloJ, 10)
local tituloL = texto(tituloJ, { Size = UDim2.new(1, -50, 1, 0), Position = UDim2.new(0, 12, 0, 0), Text = "", Font = Enum.Font.FredokaOne, TextSize = 20, TextColor3 = Color3.fromRGB(255, 236, 190), TextXAlignment = Enum.TextXAlignment.Left, ZIndex = 12 })
local fechar = botao(tituloJ, "✕", UDim2.new(0, 32, 0, 32), UDim2.new(1, -38, 0, 4), function() janela.Visible = false janelaAberta = nil end)
fechar.ZIndex = 12
local corpo = novo("ScrollingFrame", { Size = UDim2.new(1, -16, 1, -52), Position = UDim2.new(0, 8, 0, 46), BackgroundTransparency = 1, BorderSizePixel = 0, ScrollBarThickness = 6, AutomaticCanvasSize = Enum.AutomaticSize.Y, CanvasSize = UDim2.new(), ZIndex = 11 }, janela)
novo("UIListLayout", { Padding = UDim.new(0, 5), SortOrder = Enum.SortOrder.LayoutOrder }, corpo)

local function linha(txt, tam, cor, ordem)
	return texto(corpo, { Size = UDim2.new(1, -8, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, Text = txt, RichText = true, TextWrapped = true, TextSize = tam or 14, TextColor3 = cor or COR.texto, TextXAlignment = Enum.TextXAlignment.Left, LayoutOrder = ordem, ZIndex = 12 })
end
local function linhaBotao(txt, rotulo, cb, ordem, ativo, rotulo2, cb2)
	local f = novo("Frame", { Size = UDim2.new(1, -8, 0, 40), BackgroundColor3 = Color3.fromRGB(40, 26, 16), BorderSizePixel = 0, LayoutOrder = ordem, ZIndex = 12 }, corpo)
	cantos(f, 6)
	local larg = rotulo2 and 190 or 100
	texto(f, { Size = UDim2.new(1, -larg - 12, 1, 0), Position = UDim2.new(0, 8, 0, 0), Text = txt, RichText = true, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd, ZIndex = 13 })
	local b = botao(f, rotulo, UDim2.new(0, 90, 0, 30), UDim2.new(1, -(rotulo2 and 186 or 96), 0, 5), cb, ativo)
	b.ZIndex = 13
	if rotulo2 then
		local b2 = botao(f, rotulo2, UDim2.new(0, 84, 0, 30), UDim2.new(1, -90, 0, 5), cb2)
		b2.ZIndex = 13
	end
	return f
end

local function corRaridade(it) return R.raridade(it).color end
local function nomeItem(it)
	return "<font color=\"" .. corRaridade(it) .. "\">" .. it.name .. (it.refine and it.refine > 0 and (" +" .. it.refine) or "") .. "</font>"
end
local function resumoItem(it)
	local t = it.slot == "arma" and ("Dano " .. it.min .. "-" .. it.max) or (it.def > 0 and ("Defesa " .. it.def) or "")
	local afx = {}
	for _, a in ipairs(it.affixes) do
		for _, ad in ipairs(D.AFFIXES) do if ad.stat == a.stat then table.insert(afx, "+" .. a.val .. " " .. ad.label) end end
	end
	if #afx > 0 then t = t .. "  ·  " .. table.concat(afx, ", ") end
	return t
end

local function desenharJanela()
	if not janelaAberta or not H then return end
	limpar(corpo)
	local o = 0
	local function prox() o = o + 1 return o end
	if janelaAberta == "mapas" then
		tituloL.Text = "🗺️ Mapas"
		for i, z in ipairs(D.ZONES) do
			local lmin, lmax = R.faixaMapa(i)
			local livre = H.lvl >= z.min
			local atual = H.zone == i
			linhaBotao(z.icon .. "  <b>" .. z.name .. "</b>  <font color=\"#aa9878\">Nv " .. lmin .. "-" .. lmax .. "</font>", atual and "Aqui" or (livre and "Ir" or ("🔒 " .. z.min)), function()
				if livre and not atual then evAcao:FireServer("mapa", i) janela.Visible = false janelaAberta = nil end
			end, prox(), livre and not atual)
		end
	elseif janelaAberta == "heroi" then
		local c = D.CLASSES[H.cls]
		tituloL.Text = "🧙 " .. pl.DisplayName .. " · Nv " .. H.lvl .. " " .. c.name
		if F then
			local attr = {}
			for _, k in ipairs(R.ATRIBUTOS) do table.insert(attr, R.NOME_ATRIBUTO[k] .. " <b>" .. math.floor(F.A[k]) .. "</b>") end
			linha(table.concat(attr, "  ·  "), 14, nil, prox())
			linha("Vida <b>" .. fmt(F.maxHp) .. "</b>  ·  Mana <b>" .. fmt(F.maxMp) .. "</b>  ·  Ataque <b>" .. F.atkMin .. "-" .. F.atkMax .. "</b>  ·  Defesa <b>" .. F.def .. "</b>", 14, nil, prox())
			linha(string.format("Crítico <b>%.1f%%</b> (x%.2f)  ·  Ataques/s <b>%.2f</b>  ·  Esquiva <b>%d%%</b>  ·  Bloqueio <b>%d%%</b>", F.crit, F.critMult, F.aps, math.floor(F.evade * 100), math.floor(F.block * 100)), 13, COR.apagado, prox())
			linha("<i>Os pontos de atributo são distribuídos sozinhos a cada nível.</i>", 12, COR.apagado, prox())
		end
		linha("⚔️ <b>Equipamento</b>", 17, COR.ouro, prox())
		for _, sl in ipairs(D.SLOT_ORDER) do
			local it = H.equip[sl]
			local rot = sl == "arma" and "Arma" or D.ARMOR_SLOTS[sl].label
			linha("<font color=\"#aa9878\">" .. rot .. ":</font> " .. (it and (nomeItem(it) .. " <font color=\"#aa9878\">(nv " .. it.ilvl .. ")  " .. resumoItem(it) .. "</font>") or "<font color=\"#776a55\">vazio</font>"), 13, nil, prox())
		end
		linha("🎒 <b>Mochila</b> " .. #H.inv .. "/40", 17, COR.ouro, prox())
		if #H.inv > 0 then
			local vb = linhaBotao("Vender todos os comuns e mágicos", "Vender", function() evAcao:FireServer("vendercomuns") end, prox(), false)
			vb.BackgroundTransparency = 1
		end
		for _, it in ipairs(H.inv) do
			local atual = H.equip[it.slot]
			local usa = R.podeUsar(H.cls, it) and H.lvl >= it.req
			local melhor = usa and (not atual or R.pontuacao(it) > R.pontuacao(atual))
			local info = (melhor and "<font color=\"#7dff8a\">▲</font> " or "") .. nomeItem(it) .. " <font color=\"#aa9878\">nv " .. it.req .. " · " .. resumoItem(it) .. "</font>"
			local uid = it.uid
			linhaBotao(info, usa and "Equipar" or "—", function() if usa then evAcao:FireServer("equipar", uid) end end, prox(), melhor, "Vender " .. fmt(R.valor(it)), function() evAcao:FireServer("vender", uid) end)
		end
	end
end
abrirJanela = function(qual)
	if janelaAberta == qual then
		janela.Visible = false
		janelaAberta = nil
		return
	end
	janelaAberta = qual
	janela.Visible = true
	desenharJanela()
end

-- tamanho para celular
local function ajustar()
	local cam = workspace.CurrentCamera
	if not cam then return end
	local larg = cam.ViewportSize.X
	local esc = math.clamp((larg - 20) / (8 * 66), 0.62, 1.15)
	barraHab.Escala.Scale = esc
	local pequeno = larg < 700
	cartao.Size = UDim2.new(0, pequeno and 230 or 290, 0, 104)
	registro.Size = UDim2.new(0, pequeno and math.floor(larg * 0.6) or 360, 0, 120)
	registro.Position = UDim2.new(0, 10, 1, -24 - (pequeno and math.floor(76 * esc) or 0))
	janela.Size = UDim2.new(pequeno and 0.96 or 0, pequeno and 0 or 520, pequeno and 0.8 or 0, pequeno and 0 or 420)
end
ajustar()
if workspace.CurrentCamera then workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(ajustar) end

-- =====================================================================
-- Eventos do servidor
-- =====================================================================
evFicha.OnClientEvent:Connect(function(h, f)
	if not h then
		hud.Visible = false
		escolha.Visible = true
		mostrarClasse(clsEscolhida)
		return
	end
	H, F = h, f
	escolha.Visible = false
	hud.Visible = true
	local c = D.CLASSES[h.cls]
	for i = 1, 6 do
		local sk = c.skills[i]
		local s = slots[i]
		if sk then
			local livre = h.lvl >= sk.lvl
			s.nome.Text = sk.name .. (sk.type == "passive" and "\n(passiva)" or "")
			s.nome.TextColor3 = livre and COR.texto or Color3.fromRGB(120, 108, 90)
			s.tecla.Text = livre and tostring(i) or ("🔒" .. sk.lvl)
		end
	end
	desenharJanela()
end)

-- o herói anda até o alvo e vira para ele (se o jogador não estiver andando com o teclado ou o analógico)
local ultimoManual = 0
local andando = false
local function andarAteAlvo(e)
	local char = pl.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local raiz = char and char:FindFirstChild("HumanoidRootPart")
	if not (hum and raiz) or e.morto > 0 then return end
	if os.clock() - ultimoManual < 1.5 then andando = false return end
	if not e.alvo then
		if andando then hum:MoveTo(raiz.Position) andando = false end
		return
	end
	local alvo = Vector3.new(e.alvo.x, raiz.Position.Y, e.alvo.z)
	local delta = alvo - raiz.Position
	local dist = Vector3.new(delta.X, 0, delta.Z).Magnitude
	if dist > e.alcance then
		hum:MoveTo(alvo - Vector3.new(delta.X, 0, delta.Z).Unit * (e.alcance * 0.7))
		andando = true
	else
		if andando then hum:MoveTo(raiz.Position) andando = false end
		if dist > 0.5 then raiz.CFrame = CFrame.lookAt(raiz.Position, alvo) end
	end
end
UIS.InputBegan:Connect(function(inp)
	local k = inp.KeyCode
	if k == Enum.KeyCode.W or k == Enum.KeyCode.A or k == Enum.KeyCode.S or k == Enum.KeyCode.D or k == Enum.KeyCode.Up or k == Enum.KeyCode.Down or k == Enum.KeyCode.Left or k == Enum.KeyCode.Right or k == Enum.KeyCode.Space or k == Enum.KeyCode.Thumbstick1 then
		ultimoManual = os.clock()
	end
end)
UIS.InputChanged:Connect(function(inp)
	if inp.KeyCode == Enum.KeyCode.Thumbstick1 and inp.Position.Magnitude > 0.3 then ultimoManual = os.clock() end
end)
game:GetService("RunService").Heartbeat:Connect(function()
	local char = pl.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum and hum.MoveDirection.Magnitude > 0.1 and not andando then ultimoManual = os.clock() end
end)

evEstado.OnClientEvent:Connect(function(e)
	E = e
	if not H then return end
	local c = D.CLASSES[H.cls]
	nomeL.Text = "Nv " .. e.lvl .. "  " .. pl.DisplayName .. "  ·  " .. c.name
	setBarra(bVida, e.hp, e.maxHp, fmt(e.hp) .. " / " .. fmt(e.maxHp))
	setBarra(bMana, e.mp, e.maxMp, fmt(e.mp) .. " / " .. fmt(e.maxMp))
	local pct = e.lvl >= R.MAX_LEVEL and 1 or e.xp / e.need
	setBarra(bXp, pct, 1, e.lvl >= R.MAX_LEVEL and "NÍVEL MÁXIMO" or string.format("Nível %d  ·  XP %s / %s (%.1f%%)", e.lvl, fmt(e.xp), fmt(e.need), pct * 100))
	ouroL.Text = "💰 <b>" .. fmt(e.gold) .. "</b>    🧪 " .. (e.pots.hp or 0) .. "  💧 " .. (e.pots.mp or 0) .. (e.invoc > 0 and ("    🐾 " .. e.invoc .. "s") or "")
	local bs = {}
	for _, b in ipairs(e.buffs) do table.insert(bs, b.nome .. " " .. b.t .. "s") end
	buffsL.Text = table.concat(bs, "  ·  ")
	bAuto.Text = e.auto and "🤖 Auto: ON" or "🖐️ Auto: OFF"
	bAuto.BackgroundColor3 = e.auto and Color3.fromRGB(46, 120, 60) or Color3.fromRGB(104, 70, 38)
	bChefe.Text = e.chefeVivo and "👑 Chefe!" or ("👑 " .. e.kills .. "/" .. R.ABATES_CHEFE)
	bChefe.BackgroundColor3 = (e.kills >= R.ABATES_CHEFE and not e.chefeVivo) and Color3.fromRGB(170, 40, 30) or Color3.fromRGB(104, 70, 38)
	if e.alvo then
		alvoP.Visible = true
		alvoNome.Text = (e.alvo.chefe and "👑 " or "") .. "Nv " .. e.alvo.lvl .. "  " .. e.alvo.nome
		setBarra(bAlvo, e.alvo.hp, e.alvo.maxHp, fmt(e.alvo.hp) .. " / " .. fmt(e.alvo.maxHp))
	else
		alvoP.Visible = false
	end
	for i = 1, 6 do
		local sk = c.skills[i]
		local s = slots[i]
		local resta = sk and e.cds[sk.id] or 0
		if resta and resta > 0.05 then
			s.cd.Visible = true
			s.cd.Text = tostring(math.ceil(resta))
		else
			s.cd.Visible = false
		end
	end
	slots[7].nome.Text = "Vida\n" .. (e.pots.hp or 0)
	slots[8].nome.Text = "Mana\n" .. (e.pots.mp or 0)
	andarAteAlvo(e)
	if e.morto > 0 then
		mortoL.Visible = true
		mortoL.Text = "💀 Você caiu! Volta em " .. math.ceil(e.morto) .. "s"
	else
		mortoL.Visible = false
	end
end)

evAviso.OnClientEvent:Connect(function(txt, tipo)
	if tipo == "grande" then
		avisoGrande(txt)
		addLog(txt, COR.ouro)
	elseif tipo == "nivel" then
		addLog(txt, COR.ouro)
	elseif tipo == "ruim" then
		addLog(txt, Color3.fromRGB(255, 120, 100))
	elseif type(tipo) == "string" and string.sub(tipo, 1, 5) == "item:" then
		addLog(txt, Color3.fromHex(string.sub(tipo, 6)))
	else
		addLog(txt, COR.apagado)
	end
end)

-- =====================================================================
-- Controles: clicar/tocar no monstro, teclas 1-6, Q/E, R (auto)
-- =====================================================================
local pastaMonstros = workspace:WaitForChild("Monstros")
UIS.InputBegan:Connect(function(inp, ocupado)
	if ocupado then return end
	if inp.UserInputType == Enum.UserInputType.MouseButton1 or inp.UserInputType == Enum.UserInputType.Touch then
		local cam = workspace.CurrentCamera
		local raio = cam:ScreenPointToRay(inp.Position.X, inp.Position.Y)
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Include
		params.FilterDescendantsInstances = { pastaMonstros }
		local res = workspace:Raycast(raio.Origin, raio.Direction * 400, params)
		if res then
			local m = res.Instance:FindFirstAncestorOfClass("Model")
			if m and m:GetAttribute("MonId") then evAcao:FireServer("alvo", m:GetAttribute("MonId")) end
		end
		return
	end
	if not H then return end
	local teclas = { [Enum.KeyCode.One] = 1, [Enum.KeyCode.Two] = 2, [Enum.KeyCode.Three] = 3, [Enum.KeyCode.Four] = 4, [Enum.KeyCode.Five] = 5, [Enum.KeyCode.Six] = 6 }
	local n = teclas[inp.KeyCode]
	if n then
		local sk = D.CLASSES[H.cls].skills[n]
		if sk then evAcao:FireServer("habilidade", sk.id) end
	elseif inp.KeyCode == Enum.KeyCode.Q then
		evAcao:FireServer("pocao", "hp")
	elseif inp.KeyCode == Enum.KeyCode.E then
		evAcao:FireServer("pocao", "mp")
	elseif inp.KeyCode == Enum.KeyCode.R then
		evAcao:FireServer("auto")
	elseif inp.KeyCode == Enum.KeyCode.M then
		abrirJanela("mapas")
	elseif inp.KeyCode == Enum.KeyCode.C or inp.KeyCode == Enum.KeyCode.I then
		abrirJanela("heroi")
	end
end)

evAcao:FireServer("pronto")
