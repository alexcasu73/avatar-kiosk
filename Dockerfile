FROM node:20-alpine

WORKDIR /app

# Dipendenze di sistema per better-sqlite3, gltf-pipeline e Blender (fallback FBX su ARM64)
RUN apk add --no-cache python3 py3-numpy make g++ cairo-dev pango-dev blender

# Installa dipendenze npm
COPY package*.json ./
RUN npm install --omit=dev

# Copia sorgenti
COPY . .

# Directory dati (montate come volume in produzione)
RUN mkdir -p public/models public/backgrounds public/icons public/bg-videos public/idle-videos public/idle-bgs

EXPOSE 3000

CMD ["node", "server.js"]
