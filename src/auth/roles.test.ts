import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasRole, rolesAt, tokenClaims } from './roles.ts';

/** A JWT of claims, signed with nothing (the console never checks it). */
function jwt(claims: unknown): string {
  const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
  return `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}.signature`;
}

const keycloak = (roles: unknown) => ({ sub: 'u1', azp: 'zaentrum-web', realm_access: { roles } });

test('a token’s claims are its payload', () => {
  assert.deepEqual(tokenClaims(jwt({ sub: 'u1', name: 'Zoë Ångström' })), { sub: 'u1', name: 'Zoë Ångström' });
});

test('a payload in base64url, with - and _ and no padding, reads as well', () => {
  // these claims' payload holds a "-" and a "_", and its length needs padding
  const claims = { sub: '>>>?', roles: ['???>'] };
  const token = jwt(claims);
  assert.match(token.split('.')[1], /[-_]/);
  assert.notEqual(token.split('.')[1].length % 4, 0);
  assert.deepEqual(tokenClaims(token), claims);
});

test('anything that is no token has no claims', () => {
  for (const t of [undefined, null, '', 'opaque', 'a..c', 'a.!!!.c', `a.${Buffer.from('[1,2]').toString('base64url')}.c`,
    `a.${Buffer.from('"text"').toString('base64url')}.c`, `a.${Buffer.from('{oops').toString('base64url')}.c`]) {
    assert.equal(tokenClaims(t), null, String(t));
  }
});

test('the roles are read at a dot-separated path', () => {
  const claims = {
    realm_access: { roles: ['zaentrum-admin', 7, 'zaentrum-user'] },
    resource_access: { katalog: { roles: ['client-role'] } },
    groups: 'one-group',
    flat: { roles: { not: 'a list' } },
  };
  assert.deepEqual(rolesAt(claims, 'realm_access.roles'), ['zaentrum-admin', 'zaentrum-user']);
  assert.deepEqual(rolesAt(claims, 'resource_access.katalog.roles'), ['client-role']);
  assert.deepEqual(rolesAt(claims, 'groups'), ['one-group']);
  for (const path of ['flat.roles', 'realm_access', 'realm_access.roles.more', 'nowhere', '']) {
    assert.deepEqual(rolesAt(claims, path), [], path);
  }
  // a path stops at a list, as katalog-manager's does: it names keys, not places
  assert.deepEqual(rolesAt({ groups: [{ roles: ['zaentrum-admin'] }] }, 'groups.0.roles'), []);
  assert.deepEqual(rolesAt({ groups: ['zaentrum-admin'] }, 'groups.0'), []);
  assert.deepEqual(rolesAt(null, 'realm_access.roles'), []);
});

test('an admin’s token carries the admin role; a viewer’s does not', () => {
  const path = 'realm_access.roles';
  assert.equal(hasRole(jwt(keycloak(['zaentrum-user', 'zaentrum-admin'])), 'zaentrum-admin', path), true);
  assert.equal(hasRole(jwt(keycloak(['zaentrum-user', 'offline_access'])), 'zaentrum-admin', path), false);
  assert.equal(hasRole(jwt({ sub: 'u1' }), 'zaentrum-admin', path), false);
  assert.equal(hasRole(jwt({ roles: ['zaentrum-admin'] }), 'zaentrum-admin', path), false);
  assert.equal(hasRole(jwt({ roles: ['zaentrum-admin'] }), 'zaentrum-admin', 'roles'), true);
  assert.equal(hasRole(undefined, 'zaentrum-admin', path), false);
  assert.equal(hasRole(jwt(keycloak([''])), '', path), false);
});
