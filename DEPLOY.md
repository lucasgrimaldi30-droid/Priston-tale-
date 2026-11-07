# Como colocar o jogo no seu servidor

O servidor do jogo faz tudo: entrega o jogo, guarda as contas e os heróis na nuvem, mostra os outros jogadores, o chat e o ranking.

## 1. Testar no seu computador (opcional)
Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.
```bash
cd server
npm install
node server.js
```
Abra http://localhost:8080 — crie uma conta e jogue. Abra outra janela anônima com outra conta para ver os dois jogadores no mapa.

## 2. Contratar um servidor (VPS)
- Um VPS com **Ubuntu**, **1 a 2 GB de RAM** já aguenta bastante gente (Hetzner, Contabo, DigitalOcean, Hostinger, Locaweb...).
- Um **domínio** (ex.: no registro.br). No painel do domínio, crie um registro **A** apontando para o IP do VPS.

## 3. Instalar e subir
No VPS (pelo terminal/SSH):
```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/lucasgrimaldi30-droid/Priston-tale- valdaria
cd valdaria
nano docker-compose.yml        # troque "seujogo.com.br" pelo seu domínio e salve
docker compose up -d --build
```
Pronto: em 1–2 minutos o jogo abre em `https://seu-dominio` com HTTPS. No celular aparece a opção de **instalar o jogo** como aplicativo.

## 4. Atualizar para uma versão nova
```bash
cd valdaria
git pull
docker compose up -d --build
```
(Ao publicar arquivos novos do jogo, aumente `VERSAO` em `sw.js` para o aplicativo instalado baixar a versão nova.)

## 5. Backup
Os dados ficam no volume `dados` (arquivo `db.json`). Para copiar:
```bash
docker compose cp jogo:/data/db.json ./backup-db.json
```

## Observações
- O banco é um arquivo JSON — ótimo para começar. Com milhares de jogadores, o próximo passo é trocar por PostgreSQL.
- Hoje o servidor confia nos números que o jogo envia (nível, ouro...). Para evitar trapaça em grande escala, o próximo passo é o servidor
  calcular combate, experiência e drops.
