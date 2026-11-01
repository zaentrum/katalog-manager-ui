import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HAS_ORIGINAL_OPTIONS, LIST_Q, LIST_Q_UNSIZED, hasOriginalVar, listVariables, withoutSizes } from './catalog.ts';

test('the list asks for what each item has on disk and filters by it, and without them asks the rest the same', () => {
  for (const field of ['hasOriginal', 'originalBytes', 'packageBytes']) {
    assert.match(LIST_Q, new RegExp(`\\b${field}\\b`), field);
    assert.doesNotMatch(LIST_Q_UNSIZED, new RegExp(`\\b${field}\\b`), field);
  }
  assert.match(LIST_Q, /\$hasOriginal: Boolean\)/);
  assert.match(LIST_Q, /hasOriginal: \$hasOriginal, limit: 200\)/);
  const without = LIST_Q.replace(', $hasOriginal: Boolean', '')
    .replace(' hasOriginal: $hasOriginal,', '')
    .replace(' hasOriginal originalBytes packageBytes', '');
  assert.equal(without, LIST_Q_UNSIZED);
});

test('a katalog-manager without the sizes says so in its validation errors, and nothing else reads as that', () => {
  for (const error of [
    'Cannot query field "hasOriginal" on type "Item".',
    'Cannot query field "originalBytes" on type "Item".',
    'Cannot query field "packageBytes" on type "Item". Did you mean "isPackaged"?',
    'Unknown argument "hasOriginal" on field "Query.items".',
    // every error of the request at once, as gql joins them
    'Unknown argument "hasOriginal" on field "Query.items".; Cannot query field "hasOriginal" on type "Item".; ' +
      'Cannot query field "originalBytes" on type "Item".; Cannot query field "packageBytes" on type "Item".',
  ]) {
    assert.equal(withoutSizes(error), true, error);
  }
  for (const error of [
    null,
    undefined,
    '',
    'katalog-manager 502',
    'Failed to fetch',
    'Cannot query field "libraryCompliance" on type "Query".',
    'Cannot query field "originalBytes" on type "ComplianceRow".',
    'Unknown argument "hasOriginal" on field "Query.movies".',
  ]) {
    assert.equal(withoutSizes(error), false, String(error));
  }
});

test('the has-original filter keeps every item, those with an original on disk, or those with none', () => {
  assert.deepEqual(
    HAS_ORIGINAL_OPTIONS.map((o) => [o.label, hasOriginalVar(o.value)]),
    [
      ['all', null],
      ['yes', true],
      ['no', false],
    ],
  );
  assert.equal(hasOriginalVar('maybe'), null);
});

test('the filters left empty keep every item, and the has-original one is asked only of a katalog-manager that has it', () => {
  const empty = { search: '', type: '', genre: '', year: '', hasOriginal: '' };
  assert.deepEqual(listVariables(empty, true), { search: null, type: null, genre: null, year: null, hasOriginal: null });
  assert.deepEqual(listVariables(empty, false), { search: null, type: null, genre: null, year: null });
  const set = { search: 'harbour', type: 'movie', genre: 'Drama', year: '1987', hasOriginal: 'no' };
  assert.deepEqual(listVariables(set, true), { search: 'harbour', type: 'movie', genre: 'Drama', year: 1987, hasOriginal: false });
  assert.deepEqual(listVariables({ ...set, hasOriginal: 'yes' }, true).hasOriginal, true);
  assert.equal('hasOriginal' in listVariables(set, false), false);
});
