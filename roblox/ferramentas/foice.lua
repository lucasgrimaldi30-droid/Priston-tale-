-- Foice de Valdária: cria a foice com peças no Workspace.
-- Cole tudo na Barra de Comandos do Roblox Studio (Exibir > Barra de Comandos) e aperte Enter.
local m = Instance.new("Model")
m.Name = "FoiceValdaria"

local function peca(nome, tamanho, cf, cor, material, forma)
	local p = Instance.new("Part")
	p.Name = nome
	p.Size = tamanho
	p.CFrame = cf
	p.Color = cor
	p.Material = material or Enum.Material.Metal
	if forma then p.Shape = forma end
	p.Anchored = true
	p.CanCollide = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = m
	return p
end

local CABO = Color3.fromRGB(45, 32, 50)
local LAMINA = Color3.fromRGB(38, 34, 52)
local FIO = Color3.fromRGB(230, 230, 245)
local OURO = Color3.fromRGB(215, 175, 75)
local ROXO = Color3.fromRGB(160, 110, 255)
local VERTICAL = CFrame.Angles(0, 0, math.rad(90))

-- cabo, anéis e ponteira
local cabo = peca("Cabo", Vector3.new(7, 0.28, 0.28), CFrame.new(0, 5, 0) * VERTICAL, CABO, Enum.Material.Wood, Enum.PartType.Cylinder)
for i = 0, 4 do
	peca("Anel" .. i, Vector3.new(0.14, 0.4, 0.4), CFrame.new(0, 2.3 + i * 1.35, 0) * VERTICAL, (i % 2 == 0) and OURO or ROXO, Enum.Material.Metal, Enum.PartType.Cylinder)
end
peca("Ponteira", Vector3.new(0.45, 0.45, 0.45), CFrame.new(0, 1.4, 0), OURO, Enum.Material.Metal, Enum.PartType.Ball)

-- soquete e gema com luz
peca("Soquete", Vector3.new(0.7, 0.55, 0.55), CFrame.new(0, 8.6, 0) * VERTICAL, OURO, Enum.Material.Metal, Enum.PartType.Cylinder)
local gema = peca("Gema", Vector3.new(0.38, 0.38, 0.38), CFrame.new(0, 8.6, 0.3), ROXO, Enum.Material.Neon, Enum.PartType.Ball)
local luz = Instance.new("PointLight")
luz.Color = ROXO
luz.Range = 6
luz.Brightness = 2
luz.Parent = gema

-- lâmina curva: segue uma curva e vai afinando até a ponta
-- lado = 1 quando a lâmina vai para a direita, -1 quando vai para a esquerda
local function curva(a, b, c, t)
	return a:Lerp(b, t):Lerp(b:Lerp(c, t), t)
end
local function lamina(nome, a, b, c, largura, partes, lado, dentes)
	for i = 0, partes - 1 do
		local t0, t1 = i / partes, (i + 1) / partes
		local p0, p1 = curva(a, b, c, t0), curva(a, b, c, t1)
		local d = p1 - p0
		local dir = d.Unit
		local n = Vector3.new(dir.Y, -dir.X, 0) * lado -- aponta para dentro da curva
		local w = largura * (1 - t0) + 0.12
		local meio = (p0 + p1) / 2
		local giro = CFrame.Angles(0, 0, math.atan2(dir.Y, dir.X))
		local comp = d.Magnitude * 1.1
		peca(nome .. "Corpo" .. i, Vector3.new(comp, w, 0.12), CFrame.new(meio + n * (w / 2)) * giro, LAMINA)
		peca(nome .. "Fio" .. i, Vector3.new(comp, 0.14, 0.16), CFrame.new(meio + n * (w - 0.05)) * giro, FIO)
		peca(nome .. "Dorso" .. i, Vector3.new(comp, 0.1, 0.18), CFrame.new(meio) * giro, OURO)
		if dentes and i % 3 == 1 then
			peca(nome .. "Dente" .. i, Vector3.new(0.28, 0.28, 0.1), CFrame.new(meio - n * 0.08) * giro * CFrame.Angles(0, 0, math.rad(45)), LAMINA)
		end
	end
end

-- lâmina principal (para a frente, curvando para baixo) e gancho traseiro
lamina("Lamina", Vector3.new(0.2, 8.7, 0), Vector3.new(2.8, 9.9, 0), Vector3.new(4.8, 6.6, 0), 0.95, 16, 1, true)
lamina("Gancho", Vector3.new(-0.2, 8.7, 0), Vector3.new(-0.9, 9.2, 0), Vector3.new(-1.3, 8.3, 0), 0.35, 5, -1, false)

m.PrimaryPart = cabo
m.Parent = workspace
game:GetService("Selection"):Set({ m })
print("Foice criada! Aperte F para focar nela.")
