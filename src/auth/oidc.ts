import type { AuthProviderProps } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { BASE } from '../lib/basepath';

const env = import.meta.env;

// The katalog console is a standalone SPA but rides the portal's SSO session: it
// uses the SAME public OIDC client (zaentrum-web) + issuer, so a token already
// minted by the portal (same origin, same localStorage) is reused without a
// fresh redirect. The issuer is adopted from GET /api/config at runtime so one
// build works against any Keycloak; the client id is always the portal's.
export let authority: string =
  env.VITE_OIDC_AUTHORITY ?? 'https://zaentrum.demo.nalet.cloud/auth/realms/zaentrum';
export const clientId: string = env.VITE_OIDC_CLIENT_ID ?? 'zaentrum-web';

function buildConfig(): AuthProviderProps {
  return {
    authority,
    client_id: clientId,
    // redirect stays under the app's runtime base (/katalog/…); the /katalog
    // route's SPA fallback serves index.html at /katalog/auth/callback, so this
    // SPA processes the auth code. redirect_uri is wildcarded on zaentrum-web.
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

// Adopt the serving server's issuer from GET /api/config (self-host discovery).
// Any failure keeps the build-time fallback. The client id is always the portal's.
export async function initAuth(): Promise<AuthProviderProps> {
  try {
    const res = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const cfg: unknown = await res.json();
      const issuer = (cfg as { oidcIssuer?: unknown }).oidcIssuer;
      if (typeof issuer === 'string' && issuer) authority = issuer;
    }
  } catch {
    /* keep fallback authority */
  }
  return buildConfig();
}
