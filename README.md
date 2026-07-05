# katalog-manager-ui

Standalone **catalog-management console** for the zaentrum platform — the admin UI
that talks to [`katalog-manager`](https://github.com/zaentrum/katalog-manager) over
GraphQL. Catalog, scan, downloads and settings, built on `@nalet/design-system`.

It is a service in its own right so it can be released independently of the
catalog **API**. It is launched from the [zaentrum portal](https://github.com/zaentrum/zaentrum-portal)
launchpad (the `katalog` app tiles) and rides the portal's SSO session — same
public OIDC client (`zaentrum-web`), same origin — so it usually loads already
signed-in.

## Runtime-configurable mount path

The image is built once with a `/__BASE__/` placeholder base. The container
entrypoint (`docker-entrypoint.d/40-katalog-base.sh`) rewrites it to `BASE_PATH`
at start, so one image mounts at any URL path:

| `BASE_PATH`   | serves at        |
|---------------|------------------|
| `/katalog/`   | demo path-route (default) |
| `/`           | site root (standalone)    |

The OIDC issuer + web client id are read at runtime from `GET /api/config` (with
a build-time fallback), so the same published image works against any Keycloak.

## Develop

```sh
npm install          # vendored @nalet/design-system tarball in ./vendor
npm run dev          # proxies /api → http://localhost:8080 (a running katalog-manager)
npm run build        # tsc -b && vite build
```

## Container

```sh
docker build -t katalog-manager-ui .
docker run -e BASE_PATH=/katalog/ -p 8080:8080 katalog-manager-ui
```

GitHub Actions publishes `ghcr.io/zaentrum/katalog-manager-ui:latest` on push to
`main`.
