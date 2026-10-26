// Stands in for react-oidc-context, so the console renders without an
// identity provider: an administrator is signed in. The token carries the
// admin role where the console reads it (src/auth/admin.ts); the console never
// checks its signature, and the mock never reads it.
import type { ReactNode } from 'react';
import { ADMIN_ROLE, ROLES_CLAIM } from '../src/auth/admin';

const part = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// the claims, with the admin role at ROLES_CLAIM ("realm_access.roles")
const claims: Record<string, unknown> = { preferred_username: 'admin' };
let at = claims;
const path = ROLES_CLAIM.split('.');
path.forEach((step, i) => {
  if (i === path.length - 1) {
    at[step] = [ADMIN_ROLE];
  } else {
    at[step] = {};
    at = at[step] as Record<string, unknown>;
  }
});

const auth = {
  isAuthenticated: true,
  isLoading: false,
  activeNavigator: undefined,
  error: undefined,
  user: { access_token: `${part({ alg: 'none', typ: 'JWT' })}.${part(claims)}.harness`, profile: { preferred_username: 'admin' } },
  signinRedirect: async () => {},
  signoutRedirect: async () => {},
};

export function useAuth() {
  return auth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ?mock=… picks the state the mock answers from (see mock-server.mjs); the dev
// proxy passes the cookie on.
document.cookie = `mock-rules=${new URLSearchParams(location.search).get('mock') ?? ''}; path=/; SameSite=Lax`;
