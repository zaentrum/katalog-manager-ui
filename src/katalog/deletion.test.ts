import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmsTitle, deletesFromDisk, deletionNotice, noticeFrom } from './deletion.ts';

test('a delete removes something from disk when either kind of file is ticked', () => {
  assert.equal(deletesFromDisk({ files: false, packages: false }), false);
  assert.equal(deletesFromDisk({ files: true, packages: false }), true);
  assert.equal(deletesFromDisk({ files: false, packages: true }), true);
  assert.equal(deletesFromDisk({ files: true, packages: true }), true);
});

test('only the title, typed out, confirms the delete', () => {
  assert.equal(confirmsTitle('Sintel', 'Sintel'), true);
  assert.equal(confirmsTitle('  Sintel ', 'Sintel'), true);
  assert.equal(confirmsTitle('Sintel', ' Sintel '), true);
  for (const typed of ['', 'sintel', 'Sinte', 'Sintel!', 'SINTEL']) {
    assert.equal(confirmsTitle(typed, 'Sintel'), false, typed);
  }
  assert.equal(confirmsTitle('', ''), false);
  assert.equal(confirmsTitle('  ', ' '), false);
});

const done = { deleted: true, itemsRemoved: 1, filesRemoved: 0, packagesRemoved: 0, errors: [] };

test('the notice says what went from the catalog and from disk', () => {
  assert.deepEqual(deletionNotice('Sintel', { files: true, packages: true }, { ...done, filesRemoved: 2, packagesRemoved: 1 }), {
    title: 'Sintel',
    summary: 'removed 1 item from the catalog, 2 media files from disk, 1 package from disk',
    errors: [],
  });
  assert.equal(
    deletionNotice('A Show', { files: true, packages: false }, { ...done, itemsRemoved: 9, filesRemoved: 1 }).summary,
    'removed 9 items from the catalog, 1 media file from disk',
  );
  assert.equal(
    deletionNotice('A Show', { files: false, packages: true }, { ...done, itemsRemoved: 3, packagesRemoved: 0 }).summary,
    'removed 3 items from the catalog, 0 packages from disk',
  );
});

test('a catalog-only delete says the files stay and come back with the next scan', () => {
  assert.equal(
    deletionNotice('Sintel', { files: false, packages: false }, done).summary,
    'removed 1 item from the catalog; its files are left on disk, and the next scan imports them again',
  );
});

test('the errors the delete met stay in the notice', () => {
  const errs = ['/media/x.mkv: permission denied', 'package dir busy'];
  assert.deepEqual(deletionNotice('Sintel', { files: true, packages: true }, { ...done, errors: errs }).errors, errs);
  assert.deepEqual(
    deletionNotice('Sintel', { files: true, packages: true }, { ...done, errors: undefined as unknown as string[] }).errors,
    [],
  );
});

test('the list reads the notice from the router state, and nothing else', () => {
  const n = { title: 'Sintel', summary: 'removed 1 item from the catalog', errors: ['x', 7] };
  assert.deepEqual(noticeFrom({ deleted: n }), { title: 'Sintel', summary: 'removed 1 item from the catalog', errors: ['x'] });
  for (const state of [null, undefined, 'x', {}, { deleted: null }, { deleted: 'x' }, { deleted: { title: 'S' } },
    { deleted: { title: 'S', summary: 'x' } }, { deleted: { title: 7, summary: 'x', errors: [] } }, { from: { id: 'a', title: 'b' } }]) {
    assert.equal(noticeFrom(state), null, JSON.stringify(state));
  }
});
