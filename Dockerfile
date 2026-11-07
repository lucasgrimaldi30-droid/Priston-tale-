# Crônicas de Valdária — imagem do servidor (serve o jogo + API + tempo real)
FROM node:22-alpine
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm install --omit=dev
COPY . .
ENV PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "server/server.js"]
