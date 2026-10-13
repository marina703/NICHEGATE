# NicheGate — Railway/Docker deployment
# Node 22 (required for node:sqlite) + Chromium for Puppeteer PDF rendering
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ca-certificates fonts-liberation fonts-dejavu-core fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Bind 0.0.0.0 in the cloud; override anything else via Railway variables
ENV PORT=5000 \
    BIND_HOST=0.0.0.0

EXPOSE 5000

# Persistence: attach a Railway Volume at /app/data in the dashboard/CLI.
# The app refuses Railway startup unless this mount is present and writable.
# (Railway does not support declaring service volumes in this Dockerfile).

CMD ["node", "server/index.js"]
