"""Monta roblox/Valdaria.rbxlx (arquivo de lugar do Roblox Studio) com os scripts de roblox/src.
Uso: python3 roblox/ferramentas/montar.py   (depois é só abrir o .rbxlx no Roblox Studio)"""
import os, html

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ref = [0]

def novo_ref():
    ref[0] += 1
    return "RBX%08X" % ref[0]

def cdata(texto):
    # "]]>" não pode aparecer dentro de CDATA: quebra em dois blocos
    return "<![CDATA[" + texto.replace("]]>", "]]]]><![CDATA[>") + "]]>"

def script(classe, nome, caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        fonte = f.read()
    return ('<Item class="%s" referent="%s"><Properties><string name="Name">%s</string>'
            '<ProtectedString name="Source">%s</ProtectedString></Properties></Item>') % (classe, novo_ref(), html.escape(nome), cdata(fonte))

def servico(classe, filhos):
    return '<Item class="%s" referent="%s"><Properties><string name="Name">%s</string></Properties>%s</Item>' % (classe, novo_ref(), classe, "".join(filhos))

partes = [
    servico("ReplicatedStorage", [script("ModuleScript", "Dados", "src/shared/Dados.lua"), script("ModuleScript", "Regras", "src/shared/Regras.lua")]),
    servico("ServerScriptService", [script("Script", "Valdaria", "src/server/Main.server.lua")]),
    servico("StarterPlayer", [servico("StarterPlayerScripts", [script("LocalScript", "Interface", "src/client/Interface.client.lua")])]),
]
xml = ('<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
       'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">' + "".join(partes) + "</roblox>")
saida = os.path.join(RAIZ, "Valdaria.rbxlx")
with open(saida, "w", encoding="utf-8") as f:
    f.write(xml)
print("Gerado:", saida, len(xml), "bytes")
