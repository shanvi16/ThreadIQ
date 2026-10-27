# syntax=docker/dockerfile:1
# One-off seed job. Build context is the repository root.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/catalog-service/package.json services/catalog-service/package.json
COPY services/insights-service/package.json services/insights-service/package.json
COPY scripts/package.json scripts/package.json
RUN npm ci -w @threadiq/scripts
COPY tsconfig.base.json ./
COPY scripts scripts
USER node
WORKDIR /app/scripts
CMD ["npx", "tsx", "seed.ts"]
