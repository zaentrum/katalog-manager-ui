# katalog-manager-ui

Standalone **catalog-management console** for the zaentrum platform — the admin UI
that talks to [`katalog-manager`](https://github.com/zaentrum/katalog-manager) over
GraphQL. Catalog, scan, processing, rules and settings, built on `@nalet/design-system`.

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

The page of a movie, an episode or a series has **Re-encode**, which asks
first: it encodes the title again (a series' episodes that have a file) with
the instance's current pipeline settings, the transcoder's ladder and encoder
and then the packager's (katalog-manager's `reencodeItem`), and says what it
did. Its current package plays while it is encoded; once it is packaged again
it plays by on-demand transcoding until the new package is complete. A title
whose transcode or package is running is left alone, and the dialog stays
open saying why. It needs a katalog-manager with `reencodeItem`: deploy that
first, as against an older one the dialog says the field is unknown.

## Rules

Catalog management's **Rules** tab is a worklist of the titles that break a
rule the transcoder or the packager reports (katalog-manager's
`libraryCompliance`). At the top, each worker's rules as it reported them and
when, or that it never did, and when the titles were checked, with **check
again** (`refreshCompliance`); a banner says what the report leaves out. Then
how many titles break each rule, with their packages' size now and at most
after, in two columns (a rule lists its titles alone), and the re-encode
queue in numbers: queued, processing, needs attention and processed again.
The titles follow, movies by default, filtered by kind, rules and a search
("230 of 279"), the biggest package first, a hundred at a time. Each row has
the title's findings and, under them, what processing it again does to it,
with its package at most after ("Re-encoded, then packaged again, at most
11.8 GB"); the size of its original and of its package today; and its
status, a failed one with the queue's reason.

A title is processed again from its row (**process again**), several by
ticking them, or every title that matches: the header checkbox ticks the
rows on the screen, and the toolbar then offers to select all that match
and that the queue doesn't hold already (`queueable`), with their count. A
filter change keeps the rows ticked and counts those it hides; a selection
of every match goes with its filter. A title the queue holds, queued or
processing, can't be ticked. One confirm asks first, the same for one title
and many, titled with the button's words ("process 12 titles again"): each
title is processed again from its original with today's settings, one
after another; its current version plays until the new one is ready; the
original isn't changed; and their packages now and at most after, every
match's from the report's totals. The titles go to the re-encode queue
with `queueRework`, or every match with `queueReworkMatching` and the
filter, and a toast counts them, then those the queue held already. Titles
it didn't take are a warning banner, each with its reason under details
(`skippedTitles`). A title processed again that follows the rules leaves
the list and counts as processed again.

Sizes are written as chino's downloads write them: decimal units, GB with
one decimal and no trailing zero ("1.4 GB"), MB below 1 GB, and TB from
1,000 GB.

It needs a katalog-manager with `libraryCompliance` (with `matching`,
`queueable`, `queue` and the rows' `queueReason`), `queueRework` and
`queueReworkMatching` (with `skippedTitles`) and `refreshCompliance`:
against an older one the tab says that the catalog service on the server
has no rules check, and the rest of the console works.

## Track languages

The page of a movie or an episode has **Tracks**: the audio and subtitle
tracks of the title's source, each with the language its source tags it
with, the one an admin set and the one it plays as (`zxx` reads "No
dialogue", `und` "Unknown"). **Set Language** sets a track's language, from
the common languages, no dialogue, unknown or another ISO 639-2 code of three
letters, or clears it so the track plays as its source says
(katalog-manager's `setTrackLanguage`). The title's package takes it when the
title is packaged again: **Re-encode**. The tracks are those a package of the
title reported; a title packaged before katalog-manager kept them lists none
until katalog-manager's `backfillSourceTracks` has read them from its
package. It needs a katalog-manager with `tracks` and `setTrackLanguage`:
against an older one the tab says it cannot read them, and the rest of the
page works.

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

The harness runs the console as catalog management in a browser with no
cluster, no Keycloak and no katalog-manager: a stand-in for katalog-manager's
GraphQL with made-up titles, and a stub of `react-oidc-context` that signs an
administrator in. The build never reads it.

```sh
node harness/mock-server.mjs &            # the stand-in on :8793 (MOCK_PORT)
npx vite --config harness/vite.config.ts  # the console on :8794 (HARNESS_PORT)
```

http://localhost:8794/katalog-manage/rules is the rules tab; `?mock=` plays
its other states: `empty` (every title follows the rules), `never` (never
checked), `checking`, `unreported` (the transcoder never reported its
rules), `old` (a katalog-manager without the report) and `down` (it answers
502). The stand-in keeps what is queued in memory; restart it for the seeded
state.

## Container

```sh
docker build -t katalog-manager-ui .
docker run -e BASE_PATH=/katalog/ -p 8080:8080 katalog-manager-ui
```

GitHub Actions publishes `ghcr.io/zaentrum/katalog-manager-ui:latest` on push to
`main`.
