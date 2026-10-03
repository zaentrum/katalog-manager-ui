import { hasRole } from './roles';

const env = import.meta.env;

// The role an administrator's token carries, and where the token carries its
// roles: the same as katalog-manager's KATALOG_ADMIN_ROLE and
// KATALOG_ROLES_CLAIM, whose defaults these are. katalog-manager is the
// authority: it refuses an operation to a token without the role, whatever
// the console shows.
export const ADMIN_ROLE: string = (env.VITE_KATALOG_ADMIN_ROLE as string | undefined) || 'zaentrum-admin';
export const ROLES_CLAIM: string = (env.VITE_KATALOG_ROLES_CLAIM as string | undefined) || 'realm_access.roles';

/** True when the signed-in user's access token carries the admin role. */
export function isAdmin(accessToken: string | null | undefined): boolean {
  return hasRole(accessToken, ADMIN_ROLE, ROLES_CLAIM);
}
