// Pure helpers that read the signed-in user's roles out of their access
// token: no React, no DOM, so `npm test` runs them under node as they are.
// The console decides what to show with them; katalog-manager decides what
// the user may do, whatever the console shows.

/** The claims of a JWT (its payload), or null when token is none. The
 *  signature is not checked: the server does that, and refuses a token it
 *  does not trust. */
export function tokenClaims(token: string | null | undefined): Record<string, unknown> | null {
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    // base64url to base64; atob takes it without its padding
    const bytes = Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The roles at path, a dot-separated path into the claims
 *  ("realm_access.roles", where Keycloak puts realm roles): the strings of a
 *  list, or a single string; none when the path leads nowhere. */
export function rolesAt(claims: Record<string, unknown> | null, path: string): string[] {
  let v: unknown = claims;
  for (const step of path.split('.')) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
    v = (v as Record<string, unknown>)[step];
  }
  if (typeof v === 'string') return [v];
  return Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string') : [];
}

/** True when the token carries role at path. */
export function hasRole(token: string | null | undefined, role: string, path: string): boolean {
  return role !== '' && rolesAt(tokenClaims(token), path).includes(role);
}
