import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  creditRow,
  episodeLabel,
  externalIdsText,
  fromItem,
  hasEpisodeCounts,
  lockSummary,
  portraitUrl,
  type PersonCredit,
} from './people.ts';

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

test('an episode’s place reads S01E02, as much of it as is known', () => {
  assert.equal(episodeLabel(1, 2), 'S01E02');
  assert.equal(episodeLabel(10, 120), 'S10E120');
  assert.equal(episodeLabel(0, 0), 'S00E00');
  assert.equal(episodeLabel(3, null), 'S03');
  assert.equal(episodeLabel(null, 4), 'E04');
  assert.equal(episodeLabel(null, null), '');
  assert.equal(episodeLabel(), '');
});

const credit = (item: Partial<PersonCredit['item']>, more: Partial<PersonCredit> = {}): PersonCredit => ({
  id: 'c1',
  role: 'actor',
  job: null,
  character: 'Guest',
  episodeCount: null,
  ...more,
  item: { id: 'e1', title: 'Pilot', year: 2011, seasonNumber: null, episodeNumber: null, parent: null, ...item },
});

test('an episode’s credit row names its series and its place in it', () => {
  assert.deepEqual(
    creditRow(credit({ seasonNumber: 1, episodeNumber: 2, parent: { id: 's1', title: 'A Show' } })),
    {
      id: 'c1',
      itemId: 'e1',
      title: 'Pilot',
      year: 2011,
      series: { id: 's1', title: 'A Show' },
      episode: 'S01E02',
      role: 'actor',
      job: null,
      character: 'Guest',
      episodeCount: null,
    },
  );
});

test('any other title’s credit row is the title and what the credit says', () => {
  assert.deepEqual(
    creditRow(
      credit(
        { id: 's1', title: 'A Show', year: 2010 },
        { id: 'c2', role: 'writer', job: 'Writer, Co-Writer', character: null, episodeCount: 6 },
      ),
    ),
    {
      id: 'c2',
      itemId: 's1',
      title: 'A Show',
      year: 2010,
      series: null,
      episode: '',
      role: 'writer',
      job: 'Writer, Co-Writer',
      character: null,
      episodeCount: 6,
    },
  );
});
