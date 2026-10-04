# katalog-manager-ui

Standalone **catalog-management console** for the zaentrum platform — the admin UI
that talks to [`katalog-manager`](https://github.com/zaentrum/katalog-manager) over
GraphQL. Catalog, scan, processing and settings, built on `@nalet/design-system`.

It is a service in its own right so it can be released independently of the
catalog **API**. It is launched from the [zaentrum portal](https://github.com/zaentrum/zaentrum-portal)
launchpad (the `katalog` app tiles) and rides the portal's SSO session — same
public OIDC client (`zaentrum-web`), same origin — so it usually loads already
signed-in.

## For administrators

The console is for administrators: a signed-in user whose access token does
not carry the admin role (`zaentrum-admin` in `realm_access.roles`, the
defaults of katalog-manager's `KATALOG_ADMIN_ROLE` and `KATALOG_ROLES_CLAIM`)
gets a page that says so instead of the app. katalog-manager is the authority:
it refuses such a user every operation whatever the console shows. A build for
another role sets `VITE_KATALOG_ADMIN_ROLE` and `VITE_KATALOG_ROLES_CLAIM`.

Secret settings (the enrichment providers' API keys, and any setting whose
key names a credential) are write-only: the settings tab shows whether each is
set, and sets or clears it, but never shows a value.

## Processing

Catalog management's **Processing** tab is what the pipeline holds: every step
with how many items are pending, running, done, failed, retrying, stalled past
their timeout, skipped and not applicable; the failed steps with their last
error, attempts and next retry; and how katalog-manager retries a failed step
by itself. A failed step is retried from its row, or all at once (Retry All
Failed asks first). An item's **Steps** tab is its step timeline, in pipeline
order, with each step's attempts, error and retry, and a Retry for a failed
step; a series' **Episodes** tab is its seasons and episodes as a tree, each
episode with its processing state. A delete removes files from disk only when
ticked.

These need a katalog-manager with the step retries (its `processingOverview`,
`retryPolicy`, `retryStep` and `retryFailed`): deploy it first. Against an
older one the rest of the console works, and these say they cannot read.

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
npm test             # unit tests of the pure helpers (node --test; Node 22.18+ runs .ts as is)
```

## Container

```sh
docker build -t katalog-manager-ui .
docker run -e BASE_PATH=/katalog/ -p 8080:8080 katalog-manager-ui
```

GitHub Actions publishes `ghcr.io/zaentrum/katalog-manager-ui:latest` on push to
`main`.
