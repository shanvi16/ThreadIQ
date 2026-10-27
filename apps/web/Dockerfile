# syntax=docker/dockerfile:1
# Build context is the repository root. The API URLs are baked in at build time because Vite
# inlines import.meta.env.* - they must be URLs the BROWSER can reach (not container hostnames).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/catalog-service/package.json services/catalog-service/package.json
COPY services/insights-service/package.json services/insights-service/package.json
COPY scripts/package.json scripts/package.json
RUN npm ci -w @threadiq/web
COPY apps/web apps/web
ARG VITE_CATALOG_API_URL=http://localhost:3001
ARG VITE_INSIGHTS_API_URL=http://localhost:3002
ENV VITE_CATALOG_API_URL=$VITE_CATALOG_API_URL \
    VITE_INSIGHTS_API_URL=$VITE_INSIGHTS_API_URL
RUN npm run build -w @threadiq/web

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
