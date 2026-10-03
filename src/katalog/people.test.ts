import assert from 'node:assert/strict';
import { test } from 'node:test';
import { externalIdsText, fromItem, hasEpisodeCounts, lockSummary, portraitUrl } from './people.ts';

test('a film’s credits carry no episode counts', () => {
  assert.equal(hasEpisodeCounts([]), false);
  assert.equal(hasEpisodeCounts([{ episodeCount: null }, { episodeCount: null }]), false);
  assert.equal(hasEpisodeCounts([{}]), false);
});

test('a series’ credits do, even when only some have one', () => {
  assert.equal(hasEpisodeCounts([{ episodeCount: null }, { episodeCount: 6 }]), true);
  assert.equal(hasEpisodeCounts([{ episodeCount: 0 }]), true);
});

test('a portrait is read from the console’s artwork mount', () => {
  assert.equal(
    portraitUrl('a7e0a820-372e-4e8a-900a-ff718ece67e2'),
    '/api/manage/artwork/person/a7e0a820-372e-4e8a-900a-ff718ece67e2/profile',
  );
  assert.equal(portraitUrl('a/b c'), '/api/manage/artwork/person/a%2Fb%20c/profile');
});

test('a locked record locks every field, whatever lockedFields names', () => {
  assert.equal(lockSummary(true, []), 'every field');
  assert.equal(lockSummary(true, ['biography']), 'every field');
});

test('otherwise the locked fields are named, or none is', () => {
  assert.equal(lockSummary(false, ['biography', 'birthPlace']), 'biography, birthPlace');
  assert.equal(lockSummary(false, []), 'no');
});

test('external ids read like a title’s', () => {
  assert.equal(externalIdsText({ tmdbPersonId: '1234', imdbId: 'nm0001234' }), 'tmdb:1234  imdb:nm0001234');
  assert.equal(externalIdsText({ tmdbPersonId: null, imdbId: 'nm0001234' }), 'imdb:nm0001234');
  assert.equal(externalIdsText({ tmdbPersonId: '1234', imdbId: '' }), 'tmdb:1234');
  assert.equal(externalIdsText({}), '');
});

test('the title a person page was opened from comes from the router state', () => {
  const sintel = { id: 'a7e0a820-372e-4e8a-900a-ff718ece67e2', title: 'Sintel' };
  assert.deepEqual(fromItem({ from: sintel }), sintel);
  assert.deepEqual(fromItem({ from: { ...sintel, more: 1 } }), sintel);
});

test('any other state names no title', () => {
  const states = [
    null,
    undefined,
    'Sintel',
    7,
    {},
    { from: null },
    { from: 'x' },
    { from: { id: 7, title: 'Sintel' } },
    { from: { id: '', title: 'Sintel' } },
    { from: { id: 'x' } },
    { from: { id: 'x', title: '' } },
  ];
  for (const state of states) assert.equal(fromItem(state), null, JSON.stringify(state));
});
