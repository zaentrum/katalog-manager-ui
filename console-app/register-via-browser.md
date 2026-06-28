# Registering katalog with the launchpad

The launchpad exposes a registration endpoint at
`POST /api/external-apps/register` that creates the space + group + tiles + a
proxy route in a single multipart request. The endpoint requires a logged-in
browser session (the launchpad runs Spring `oauth2Login`, not a resource
server), so the simplest one-shot registration is from the browser DevTools
console.

## Option A — browser DevTools (recommended)

1. Sign in to the launchpad in your browser.
2. Open DevTools → Console.
3. Paste the snippet below and run it.

```javascript
const manifest = {
  "sap.app": {
    "id": "com.nalet.katalog",
    "type": "application",
    "title": "Katalog",
    "description": "Media catalog admin",
    "crossNavigation": {
      "inbounds": {
        "Katalog-manage": {
          "semanticObject": "Katalog",
          "action": "manage",
          "title": "Katalog — Library",
          "subTitle": "Browse movies, series, music",
          "icon": "sap-icon://media-play"
        },
        "Katalog-scans": {
          "semanticObject": "Katalog",
          "action": "scans",
          "title": "Katalog — Scans",
          "subTitle": "Library scan history",
          "icon": "sap-icon://synchronize"
        }
      }
    }
  },
  "sap.ui5": { "componentName": "com.nalet.katalog" }
};

const fd = new FormData();
fd.append('manifest', new File([JSON.stringify(manifest)], 'manifest.json', { type: 'application/json' }));
fd.append('upstreamUrl',    'http://katalog-manager-ui.<namespace>.svc.cluster.local');
fd.append('apiUpstreamUrl', 'http://katalog-manager-api.<namespace>.svc.cluster.local');
fd.append('apiPathPrefix',  'katalog-api');
fd.append('appId',          'katalog');
fd.append('title',          'Katalog');
fd.append('description',    'Media catalog admin');
fd.append('spaceId',        'media-platform');
fd.append('spaceTitle',     'Media platform');
fd.append('spaceDescription', 'Media platform — catalog, products, and admin surfaces.');
fd.append('spaceIcon',      'sap-icon://media-play');
fd.append('spaceOrder',     '30');
fd.append('groupId',        'media-platform::catalog');
fd.append('groupTitle',     'Catalog');
fd.append('groupOrder',     '10');
fd.append('initialTileOrder', '10');
fd.append('defaultIcon',    'sap-icon://media-play');

const r = await fetch('/api/external-apps/register', { method: 'POST', body: fd, credentials: 'include' });
console.log(r.status, await r.json());
```

A successful response looks like:

```json
{
  "appId": "katalog",
  "spaceId": "media-platform",
  "groupId": "media-platform::catalog",
  "tilesUpserted": 2,
  "tileIds": ["katalog-Katalog-manage", "katalog-Katalog-scans"]
}
```

Refresh the home page; the new **Media platform** space appears in the FLP
shell with the **Katalog — Library** and **Katalog — Scans** tiles. Click
either tile and the launchpad reverse-proxies you to the registered upstream,
relaying your access token (which now contains `katalog` in its `aud` claim
thanks to the audience-katalog protocol mapper on the launchpad identity
client).

The three product webs (chino, fernseh, musig) are not part of the
registration — they live in a separate **Products** group, which the SQL seed
(`seed.sql`) creates if you prefer that path.

## Option B — direct SQL

If you'd rather apply the canonical seed directly, point `psql` at the
launchpad catalog database (use its connection URL and owning role for your
environment):

```bash
psql "$LAUNCHPAD_DB_URL" -f console-app/seed.sql
```

This adds both the **Catalog** and **Products** groups and all the catalog
tiles in one transaction.
