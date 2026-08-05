import type { AuthProviderProps } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { BASE } from '../lib/basepath';

const env = import.meta.env;

// The katalog console is a standalone SPA but rides the portal's SSO session: it
// uses the SAME public OIDC client + issuer, so a token already minted by the
// portal (same origin, same localStorage) is reused without a fresh redirect.
//
// BOTH the issuer and the client id are adopted from GET /api/config at runtime,
// so one build works against any Keycloak. The client id used to be a
// build-time constant defaulting to 'zaentrum-web' — which is the demo realm's
// client and does not exist on a shared realm, where the portal rides a
// per-instance client (e.g. chino-beta). The deployment sets no
// VITE_OIDC_CLIENT_ID, so both catalog tiles authenticated with a client that
// is not there and Keycloak answered 400 "Client not found". The tiles were
// simply dead, and the config endpoint had been reporting the right id all
// along.
export let authority: string =
  env.VITE_OIDC_AUTHORITY ?? 'https://zaentrum.demo.nalet.cloud/auth/realms/zaentrum';
export let clientId: string = env.VITE_OIDC_CLIENT_ID ?? 'zaentrum-web';

function buildConfig(): AuthProviderProps {
  return {
    authority,
    client_id: clientId,
    // redirect stays under the app's runtime base (/katalog/…); the /katalog
    // route's SPA fallback serves index.html at /katalog/auth/callback, so this
    // SPA processes the auth code. redirect_uri is wildcarded on the client.
    redirect_uri: `${window.location.origin}${BASE}auth/callback`,
    post_logout_redirect_uri: `${window.location.origin}${BASE}`,
    response_type: 'code',
    scope: 'openid profile email',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    onSigninCallback: () => {
      window.history.replaceState(null, '', BASE || '/');
    },
  };
}

// Adopt the serving server's issuer AND portal client id from GET /api/config
// (self-host discovery). Any failure keeps the build-time fallback.
export async function initAuth(): Promise<AuthProviderProps> {
  try {
    const res = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const cfg: unknown = await res.json();
      const issuer = (cfg as { oidcIssuer?: unknown }).oidcIssuer;
      if (typeof issuer === 'string' && issuer) authority = issuer;

      // Prefer the portal's client (this SPA shares its session); fall back to
      // the web client, then to the build-time value.
      const ids = (cfg as { oidcClientId?: Record<string, unknown> }).oidcClientId;
      const fromCfg = [ids?.portal, ids?.web].find(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
      if (fromCfg) clientId = fromCfg;
    }
  } catch {
    /* keep fallback authority */
  }
  return buildConfig();
}
