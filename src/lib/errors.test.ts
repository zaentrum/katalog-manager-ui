import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHOWN_ERRORS, errorText } from './errors.ts';
import { withoutSizes } from '../katalog/catalog.ts';
import { notCheckedHere } from '../katalog/compliance.ts';

test('a field that failed for every item of a page reads once', () => {
  const message = 'the sizes of the page could not be read: the catalog is down';
  // one error an item and field, as katalog-manager answers 200 items of 3 fields
  assert.equal(errorText(Array.from({ length: 600 }, () => message)), message);
});

test('a request shows its first messages, each once, and how many more there are', () => {
  assert.equal(SHOWN_ERRORS, 3);
  assert.equal(errorText(['one']), 'one');
  assert.equal(errorText(['one', 'two', 'one', 'three']), 'one; two; three');
  assert.equal(errorText(['one', 'two', 'three', 'four', 'two', 'five']), 'one; two; three; and 2 more');
  assert.equal(errorText([]), '');
});

test('what an older katalog-manager answers still reads as such in the first messages', () => {
  // the list asking for the sizes: an argument and three fields it doesn't know
  const list = errorText([
    'Unknown argument "hasOriginal" on field "Query.items".',
    'Cannot query field "hasOriginal" on type "Item".',
    'Cannot query field "originalBytes" on type "Item".',
    'Cannot query field "packageBytes" on type "Item". Did you mean "isPackaged"?',
  ]);
  assert.match(list, /; and 1 more$/);
  assert.equal(withoutSizes(list), true);
  // the rules tab asking for the report
  const rules = errorText([
    'Unknown type "ComplianceKind".',
    'Unknown type "ComplianceRule".',
    'Cannot query field "libraryCompliance" on type "Query".',
  ]);
  assert.equal(notCheckedHere(rules), true);
});
