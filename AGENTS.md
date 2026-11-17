# katalog-manager-ui

The catalog console of zaentrum, for administrators: the catalog's list and a title's page,
and catalog management (scans, processing, rules, settings). A React, Vite and TypeScript
single-page app served by nginx; the path it is mounted at picks the console, one with
`manage` in it catalog management, any other the catalog. It talks to katalog-manager over
GraphQL (`/api/manage/query`) and its live stream (`/api/manage/stream`), reads the sign-in
service from the platform's `GET /api/config`, and shares the portal's sign-in on the same
origin; the portal's launchpad opens it. katalog-manager decides what a token may do; one
without the admin role gets a page that says so.
How a change is proposed and what a pull request has to pass is in the
[guide to contributing](https://github.com/zaentrum/.github/blob/main/CONTRIBUTING.md);
what may be built is in [building from the specification](https://github.com/zaentrum/zaentrum/blob/main/AGENTS.md).

## Build

```sh
npm ci
npm run build                          # tsc -b && vite build -> dist/
docker build -t katalog-manager-ui .   # nginx-unprivileged on 8080
```

The tests need Node 22.18 or later (`image.yml` uses 24; the image builds on
`node:20-alpine`). The bundle has the placeholder base `/__BASE__/`; at start the image's
`docker-entrypoint.d/40-katalog-base.sh` rewrites it to `BASE_PATH` (default `/katalog/`).
The design system comes from the tarball in `vendor/`. Build-time variables:
`VITE_OIDC_AUTHORITY` and `VITE_OIDC_CLIENT_ID` (when `/api/config` names none),
`VITE_KATALOG_GQL`, `VITE_KATALOG_STREAM`, `VITE_KATALOG_ADMIN_ROLE`, `VITE_KATALOG_ROLES_CLAIM`.

## Test

```sh
npm ci
npm test        # node --test 'src/**/*.test.ts'
```

`.github/workflows/build.yml` runs `npm ci`, `npm run build`, `npm test` and a build of the
image on every pull request and on main. `.github/workflows/image.yml` runs the tests again on
main and on a release tag, before it builds and publishes the image. The tests need nothing
else and skip nothing.

## Run it

The harness runs the real console against recorded answers: a stand-in for katalog-manager's
GraphQL and the rules report's CSV, with made-up titles, and a stub of `react-oidc-context`
that signs an administrator in.

```sh
node harness/mock-server.mjs &             # the stand-in on :8793 (MOCK_PORT)
npx vite --config harness/vite.config.ts   # the console on :8794 (HARNESS_PORT)
```

`http://localhost:8794/katalog-manage/rules` is the rules tab; `?mock=` plays its other
states (`empty`, `never`, `checking`, `old`, `down` and more, listed in the README). With
`HARNESS_BASE=/katalog/` it is the catalog, at `http://localhost:8794/katalog/`. The stand-in
keeps what is queued in memory; restart it for the seeded state.

`npm run dev` serves the catalog at `http://localhost:5174/__BASE__/` and proxies `/api` to
`http://localhost:8080`, where katalog-manager listens when run as its README says (`go run
./cmd/server`, with a Postgres). katalog-manager answers no `/api/config`, so sign-in then goes
to `VITE_OIDC_AUTHORITY` (else `/auth/realms/zaentrum` on the page's origin) as
`VITE_OIDC_CLIENT_ID` (else `zaentrum-web`). The image serves the files alone, with `/api`
and the sign-in on the same origin, as in the reference demo
([how it is deployed](https://github.com/zaentrum/zaentrum/blob/main/docs/reference-demo.md)):

```sh
docker run -e BASE_PATH=/katalog/ -p 8080:8080 katalog-manager-ui
```

## What the tests leave unchecked

- The views: the tests cover the helpers in `src/**/*.ts`; the `.tsx` views have none and are
  looked at in the harness, by hand.
- The queries: nothing holds the console's GraphQL against katalog-manager's schema. The
  stand-in answers what the console asks; a field katalog-manager lacks shows only against it.
- Sign-in and the admin check meet a real sign-in service only on a platform; the harness
  stubs both.
- Nothing starts the image, so the entrypoint's `BASE_PATH` rewrite has no test.
  `npm run lint` (oxlint) is in no workflow.

## Before a pull request

The design system is vendored: `package.json` installs the tarball in `vendor/` by `file:`,
and `package-lock.json` holds its sha512. A new tarball goes in with both files updated by
`npm install`. `npm ci` on a fresh runner fails with `EINTEGRITY` when they differ; a local
npm cache can hide that by installing the copy it already holds.
