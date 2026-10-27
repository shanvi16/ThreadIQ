# syntax=docker/dockerfile:1
# Test runner image: type-checks and runs the service test suites inside Docker.
# Tests use the compose MongoDB (TEST_MONGO_URI) - the in-memory MongoDB binary is not used here.
# Build context is the repository root.
FROM node:22-alpine
ENV MONGOMS_DISABLE_POSTINSTALL=1 CI=true
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/catalog-service/package.json services/catalog-service/package.json
COPY services/insights-service/package.json services/insights-service/package.json
COPY scripts/package.json scripts/package.json
RUN npm ci -w @threadiq/catalog-service -w @threadiq/insights-service
COPY tsconfig.base.json ./
COPY services services
USER node
CMD ["sh", "-c", "npm run typecheck -w @threadiq/catalog-service -w @threadiq/insights-service && TEST_MONGO_URI=mongodb://mongo:27017/threadiq_catalog_test npm run test -w @threadiq/catalog-service && TEST_MONGO_URI=mongodb://mongo:27017/threadiq_sales_test npm run test -w @threadiq/insights-service"]
