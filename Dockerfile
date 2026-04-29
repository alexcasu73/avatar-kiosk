FROM node:20-alpine

WORKDIR /app

# Dipendenze di sistema per better-sqlite3 e gltf-pipeline
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev assimp

# Installa dipendenze npm
COPY package*.json ./
RUN npm install --omit=dev

# Copia sorgenti
COPY . .

# Directory dati (montate come volume in produzione)
RUN mkdir -p public/models public/backgrounds public/icons public/bg-videos public/idle-videos public/idle-bgs

EXPOSE 3000

CMD ["node", "server.js"]
