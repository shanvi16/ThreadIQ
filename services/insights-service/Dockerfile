# syntax=docker/dockerfile:1
# Build context is the repository root (npm workspaces share one lockfile).

FROM node:22-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/catalog-service/package.json services/catalog-service/package.json
COPY services/insights-service/package.json services/insights-service/package.json
COPY scripts/package.json scripts/package.json

FROM manifests AS build
RUN npm ci -w @threadiq/insights-service
COPY tsconfig.base.json ./
COPY services/insights-service services/insights-service
RUN npm run build -w @threadiq/insights-service

FROM manifests AS prod-deps
RUN npm ci -w @threadiq/insights-service --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY services/insights-service/package.json services/insights-service/package.json
COPY --from=build /app/services/insights-service/dist services/insights-service/dist
USER node
EXPOSE 3002
CMD ["node", "services/insights-service/dist/server.js"]
