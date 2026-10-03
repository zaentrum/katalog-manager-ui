// Pure helpers for the settings tab: no React, no DOM, so `npm test` runs
// them under node as they are.

/** A setting as katalog-manager's settings query gives it. A secret one (an
 *  API key, a token, a password) is write-only: valueText is null, isSet says
 *  whether it has a value, and setSecretSetting / clearSecretSetting change
 *  it. */
export interface Setting {
  id: string;
  key: string;
  valueText: string | null;
  valueType: string;
  description: string | null;
  isSecret: boolean;
  isSet: boolean;
  updatedAt: string | null;
}

// What katalog-manager takes for a secret (graph/settings.go): the keys it
// reads as API keys, and any key that names a credential.
const SECRET_KEYS = ['tmdb.api_key', 'omdb.api_key', 'fanart.api_key', 'fanart.client_key'];
const SECRET_WORDS = /secret|token|passw(or)?d|credential|api[._-]?key/i;
const SECRET_KEY_SUFFIX = /(^|[._-])key$/i;

/** True when katalog-manager will take key for a secret. For a stored
 *  setting the server says so itself (isSecret); this tells apart a key
 *  typed into the new-setting form, so its value goes in write-only. */
export function isSecretKey(key: string): boolean {
  const k = key.trim();
  return SECRET_KEYS.includes(k) || SECRET_WORDS.test(k) || SECRET_KEY_SUFFIX.test(k);
}

/** What a secret's status reads; a secret never stored is not set. */
export function secretStatus(s: { isSet: boolean } | null | undefined): 'set' | 'not set' {
  return s?.isSet ? 'set' : 'not set';
}

/** The setting stored under key, if any. */
export function settingFor<S extends { key: string }>(settings: readonly S[], key: string): S | null {
  return settings.find((s) => s.key === key) ?? null;
}
