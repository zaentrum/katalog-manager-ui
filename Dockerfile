# Base-image registry prefix. Empty default = public Docker Hub (anyone can build).
# A private deploy mirror passes e.g. --build-arg BASE=registry.example/library/ .
ARG BASE=

# build the SPA (vendored @nalet/design-system tarball is in ./vendor)
FROM ${BASE}node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json* ./
COPY vendor ./vendor
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY . .
# Builds with a `/__BASE__/` placeholder base (see vite.config.ts). The runtime
# entrypoint rewrites it to the real BASE_PATH, so ONE image mounts at any path.
RUN npm run build

FROM ${BASE}nginxinc/nginx-unprivileged:1.27-alpine
USER root
# Stage the built SPA under /app; the entrypoint copies it into the html root
# under BASE_PATH and rewrites the placeholder at container start.
COPY --from=build /src/dist /app
COPY docker-entrypoint.d/40-katalog-base.sh /docker-entrypoint.d/40-katalog-base.sh
RUN chmod +x /docker-entrypoint.d/40-katalog-base.sh \
  && chown -R 101:0 /usr/share/nginx/html /etc/nginx/conf.d /app \
  && chmod -R g+w /usr/share/nginx/html /etc/nginx/conf.d
USER 101
ENV BASE_PATH=/katalog/
EXPOSE 8080
LABEL org.opencontainers.image.source="https://github.com/zaentrum/katalog-manager-ui"
LABEL org.opencontainers.image.title="katalog-manager-ui"
LABEL org.opencontainers.image.description="Standalone catalog-management console (GraphQL) for the zaentrum platform"
