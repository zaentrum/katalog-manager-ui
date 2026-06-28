-- Source-of-truth seed for the launchpad (FLP) catalog. The same
-- registration can be done via POST /api/external-apps/register on the
-- launchpad (see console-app/manifest.json + register-via-browser.md),
-- which internally does these same upserts via the CAP PersistenceService.
--
-- Apply against the launchpad catalog database with its owning role.
--
-- This seed keeps the row id `katalog` (rather than `katalog-manager`)
-- so the existing launchpad tile registrations + FLP intents
-- (`#Movies-list`, `#Katalog-settings`, …) continue to resolve without
-- having to migrate every tile row in lockstep. The split between
-- write-API (Java CAP) and UI (nginx) is invisible to the launchpad —
-- the launchpad proxy handles it via `api_path_prefix`.

-- ---------------------------------------------------------------------------
-- Media platform space + two groups (Catalog management, Product apps).
-- ---------------------------------------------------------------------------
INSERT INTO console_spaces (id, title, description, icon, sort_order, active)
VALUES ('media-platform', 'Media platform',
        'zaentrum media platform — catalog, products, and admin surfaces.',
        'sap-icon://media-play', 30, true)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

INSERT INTO console_groups (id, title, space_id, sort_order, active)
VALUES ('media-platform::catalog',  'Catalog',  'media-platform', 10, true),
       ('media-platform::products', 'Products', 'media-platform', 20, true)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  space_id = EXCLUDED.space_id,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

-- ---------------------------------------------------------------------------
-- Launchpad external-app registration. The launchpad proxy resolves
-- /proxy/katalog/** against `upstream_url` for static UI assets, and
-- /proxy/katalog/<api_path_prefix>/** against `api_upstream_url` for
-- OData traffic. Bearer relay is on; tokens carry the `katalog`
-- audience (set by the audience-katalog protocol mapper on the
-- launchpad + per-product identity clients).
--
-- Read/write split shape:
--   upstream_url     -> katalog-manager-ui  (static nginx)
--   api_upstream_url -> katalog-manager-api (CAP Java OData)
--   api_path_prefix  -> katalog-api  (unchanged from the legacy row so
--                                     existing UI builds keep working)
-- ---------------------------------------------------------------------------
INSERT INTO console_external_apps (id, title, description,
        upstream_url, api_upstream_url, api_path_prefix,
        relay_token, component_id, manifest_json, active)
VALUES ('katalog',
        'Katalog',
        'zaentrum media catalog admin (movies, series, music).',
        'http://katalog-manager-ui.<namespace>.svc.cluster.local',
        'http://katalog-manager-api.<namespace>.svc.cluster.local',
        'katalog-api',
        true,
        'com.nalet.katalog',
        '{"sap.app":{"id":"com.nalet.katalog","type":"application","title":"Katalog"}}',
        true)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  upstream_url = EXCLUDED.upstream_url,
  api_upstream_url = EXCLUDED.api_upstream_url,
  api_path_prefix = EXCLUDED.api_path_prefix,
  relay_token = EXCLUDED.relay_token,
  component_id = EXCLUDED.component_id,
  active = EXCLUDED.active;

-- ---------------------------------------------------------------------------
-- Tiles. All seven catalog tiles share the same SAPUI5 component
-- (`com.nalet.katalog`) served from /proxy/katalog. The FLP shell
-- resolves each tile's intent (semantic_object + intent_action) against
-- the inbounds declared in the component manifest and renders the
-- matching ListReport target without leaving the launchpad chrome.
--
-- IDs and intents are unchanged from the legacy catalog seed so a fresh
-- apply doesn't move tiles around in the user's launchpad.
-- ---------------------------------------------------------------------------
DELETE FROM console_tiles WHERE id IN ('katalog-manage');

INSERT INTO console_tiles (id, title, subtitle, url, icon, target,
        semantic_object, intent_action, intent_url, application_type, component_id,
        space_id, group_id, sort_order, active)
VALUES
  ('katalog-movies',
   'Movies', 'Browse the movie library',
   '#Movies-list', 'sap-icon://video', '_self',
   'Movies', 'list',
   '/proxy/katalog/katalog',
   'SAPUI5', 'com.nalet.katalog',
   'media-platform', 'media-platform::catalog', 10, true),

  ('katalog-shows',
   'Shows', 'Browse the series library',
   '#Series-list', 'sap-icon://video', '_self',
   'Series', 'list',
   '/proxy/katalog/katalog',
   'SAPUI5', 'com.nalet.katalog',
   'media-platform', 'media-platform::catalog', 20, true),

  ('katalog-music',
   'Music', 'Browse the music library',
   '#Music-list', 'sap-icon://media-play', '_self',
   'Music', 'list',
   '/proxy/katalog/katalog',
   'SAPUI5', 'com.nalet.katalog',
   'media-platform', 'media-platform::catalog', 30, true),

  ('katalog-items',
   'All items', 'Unified catalog (every type)',
   '#Katalog-items', 'sap-icon://list', '_self',
   'Katalog', 'items',
   '/proxy/katalog/katalog',
   'SAPUI5', 'com.nalet.katalog',
   'media-platform', 'media-platform::catalog', 40, true),

  ('katalog-scans',
   'Scan jobs', 'Library scan history',
   '#Katalog-scans', 'sap-icon://synchronize', '_self',
   'Katalog', 'scans',
   '/proxy/katalog/katalog',
   'SAPUI5', 'com.nalet.katalog',
   'media-platform', 'media-platform::catalog', 50, true),

  ('katalog-processing',
   'Processing', 'Pipeline step status across the catalog',
   '#Katalog-processing', 'sap-icon://activity-2', '_self',
   'Katalog', 'processing',
   '/proxy/katalog/katalog',
   'SAPUI5', 'com.nalet.katalog',
   'media-platform', 'media-platform::catalog', 60, true),

  ('katalog-settings',
   'Settings', 'Packager language whitelist + Validate thresholds',
   '#Katalog-settings', 'sap-icon://action-settings', '_self',
   'Katalog', 'settings',
   '/proxy/katalog/katalog',
   'SAPUI5', 'com.nalet.katalog',
   'media-platform', 'media-platform::catalog', 70, true),

  ('chino-beta-web',
   'Chino Beta', 'Movies + series web app',
   '#Chino-view', 'sap-icon://video', '_blank',
   'Chino', 'view', 'https://chino.example.com/', 'URL', NULL,
   'media-platform', 'media-platform::products', 10, true),

  ('fernseh-beta-web',
   'Fernseh Beta', 'Live TV web app',
   '#Fernseh-view', 'sap-icon://broadcast', '_blank',
   'Fernseh', 'view', 'https://fernseh.example.com/', 'URL', NULL,
   'media-platform', 'media-platform::products', 20, true),

  ('musig-beta-web',
   'Musig Beta', 'Music web app',
   '#Musig-view', 'sap-icon://media-play', '_blank',
   'Musig', 'view', 'https://musig.example.com/', 'URL', NULL,
   'media-platform', 'media-platform::products', 30, true)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  url = EXCLUDED.url,
  icon = EXCLUDED.icon,
  target = EXCLUDED.target,
  semantic_object = EXCLUDED.semantic_object,
  intent_action = EXCLUDED.intent_action,
  intent_url = EXCLUDED.intent_url,
  application_type = EXCLUDED.application_type,
  component_id = EXCLUDED.component_id,
  space_id = EXCLUDED.space_id,
  group_id = EXCLUDED.group_id,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;
