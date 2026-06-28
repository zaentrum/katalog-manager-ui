# Base-image registry prefix. Empty default = public Docker Hub; a private
# deploy mirror passes --build-arg BASE=registry.example/library/ .
ARG BASE=
# katalog-manager-ui — UI5 Fiori Elements SPA served by nginx.
#
# Two-stage build. There's no API here — OData calls go through the
# launchpad proxy (api_path_prefix=katalog-api in console_external_apps)
# to the sibling katalog-manager-api service.
#
# Stage 1: ui5-cli build → static dist/ directory.
# Stage 2: nginx alpine serving the dist, listening on 8080 so the
# default OpenShift random-UID + GID 0 pod can bind it.
FROM ${BASE}node:20-alpine AS ui-build
WORKDIR /build

# Cache npm deps independently of the source tree so a UI source edit
# doesn't blow the node_modules layer away.
COPY katalog-manage/package.json katalog-manage/package-lock.json* ./katalog-manage/
RUN cd katalog-manage && (npm ci || npm install --no-audit --no-fund)

COPY katalog-manage ./katalog-manage
# `ui5 build --dest dist` emits the production-mode bundle: ES6
# transpiled, CSS minified, version-stamped resource URLs.
RUN cd katalog-manage && npm run build

# Stage 2: nginx runtime.
FROM ${BASE}nginxinc/nginx-unprivileged:1.27-alpine
# The nginxinc/nginx-unprivileged image already runs as uid 101 and
# listens on 8080 by default — matches OpenShift's random-UID security
# model without needing a custom user/chown dance.

COPY --from=ui-build /build/katalog-manage/dist /usr/share/nginx/html

# Hand-rolled nginx config: SPA fallback to /index.html, gzip on,
# cache-control headers for the long-lived `resources/` paths the
# UI5 build emits.
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
