FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
# Aplica migraciones, registra comandos y arranca
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/scripts/deploy-commands.js && node dist/index.js"]
