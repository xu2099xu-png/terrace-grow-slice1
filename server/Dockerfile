FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app

ENV APP_ENV=production
ENV PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node src/weather/fixtures ./dist/src/weather/fixtures
COPY --chown=node:node data ./data
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN rm -rf ./node_modules/.cache && chmod 0555 ./docker-entrypoint.sh
USER node

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health/ready" >/dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
