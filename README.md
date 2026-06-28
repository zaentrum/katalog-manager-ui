# katalog-manager-ui

UI5 Fiori Elements app for the zaentrum catalog admin surface. Talks to
`katalog-manager-api` via OData v4. Designed to be hosted as a tile inside
a Fiori launchpad (FLP) shell.

## Status

Scaffold. The catalog read/write split puts this UI on the admin-side
surface — it talks to `katalog-manager-api`, never directly to the
read-path catalog service.

## Layout

```
katalog-manage/                 # the UI5 / Fiori Elements application
  webapp/                       # Component, manifest, custom controls + actions
  ui5.yaml                      # UI5 tooling config (TypeScript transpile)
console-app/                    # launchpad registration (manifest + seed SQL)
k8s/                            # Deployment, Service, ServiceAccount
Dockerfile                      # ui5 build -> nginx static runtime
nginx.conf                      # SPA fallback + caching for the static bundle
```

## Local development

```bash
cd katalog-manage
npm ci
npm run start
```

The OData base path is `/proxy/katalog-manager-ui/odata/v4/katalog-admin/`
(routed by the launchpad upstream registration in `console-app/seed.sql`).

## Build the container

```bash
docker build -t zaentrum/katalog-manager-ui .
```

The `k8s/` manifests are samples — adjust the namespace, image reference,
and pull secrets for your environment, build and push the image to your own
registry, then apply them.

## License

[MPL-2.0](LICENSE).
