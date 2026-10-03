import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSecretKey, secretStatus, settingFor } from './settings.ts';

test('the API keys katalog-manager reads are secrets', () => {
  for (const key of ['tmdb.api_key', 'omdb.api_key', 'fanart.api_key', 'fanart.client_key', ' tmdb.api_key ']) {
    assert.equal(isSecretKey(key), true, key);
  }
});

test('a key that names a credential is a secret, as katalog-manager takes it', () => {
  for (const key of ['TMDB_API_KEY', 'subtitles.apikey', 'webhooks.api-key', 'smtp.password', 'db.passwd',
    'oauth.client_secret', 'Secret', 'trailers.token', 'registry.credentials', 'license.key', 'signing_key', 'key']) {
    assert.equal(isSecretKey(key), true, key);
  }
});

test('any other key keeps its value', () => {
  for (const key of ['validate.small_file_threshold_mb', 'packager.languages', 'scanner.roots', 'monkey.count',
    'keyboard.layout', 'keys.sorted', '']) {
    assert.equal(isSecretKey(key), false, key);
  }
});

test('a secret is set or not set, and one never stored is not set', () => {
  assert.equal(secretStatus({ isSet: true }), 'set');
  assert.equal(secretStatus({ isSet: false }), 'not set');
  assert.equal(secretStatus(null), 'not set');
  assert.equal(secretStatus(undefined), 'not set');
});

test('a setting is found by its key', () => {
  const settings = [
    { key: 'tmdb.api_key', id: 'a' },
    { key: 'omdb.api_key', id: 'b' },
    { key: 'tmdb.api_key', id: 'c' },
  ];
  assert.equal(settingFor(settings, 'tmdb.api_key')?.id, 'a');
  assert.equal(settingFor(settings, 'omdb.api_key')?.id, 'b');
  assert.equal(settingFor(settings, 'fanart.api_key'), null);
});
