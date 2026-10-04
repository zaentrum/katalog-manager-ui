import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canReencode, reencodeExplainer, reencodeNotice, reencodeStarted, type ReencodeResult } from './reencode.ts';

test('a movie, an episode and a series are encoded again, nothing else', () => {
  for (const type of ['movie', 'episode', 'series']) assert.equal(canReencode(type), true, type);
  for (const type of ['album', 'track', 'season', 'person', '']) assert.equal(canReencode(type), false, type);
});

test('the confirm says it encodes with the current settings, what plays meanwhile and what it leaves alone', () => {
  const film = reencodeExplainer('movie', 'Sintel').join(' ');
  assert.match(film, /^encodes “Sintel” again with this instance’s current pipeline settings/);
  assert.match(film, /the transcoder’s ladder and encoder, then the packager’s/);
  assert.match(film, /its current package plays while it is encoded/);
  assert.match(film, /plays by on-demand transcoding until the new package is complete/);
  assert.match(film, /has to start again/);
  assert.match(film, /running is left alone/);
  assert.deepEqual(reencodeExplainer('episode', 'Pilot'), reencodeExplainer('movie', 'Pilot'));

  const series = reencodeExplainer('series', 'Pioneer One');
  assert.equal(series.length, 3);
  assert.match(series[0], /^encodes every episode of “Pioneer One” that has a file again with this instance’s current pipeline settings/);
  assert.match(series[1], /each episode’s current package plays while it is encoded/);
  assert.match(series[2], /^an episode whose transcode or package is running is left alone/);
});

const result = (r: Partial<ReencodeResult>): ReencodeResult => ({
  itemId: 'm1',
  titles: 1,
  reencoded: 0,
  busy: 0,
  notSent: 0,
  message: 'encoding it again',
  ...r,
});

test('a re-encode that started a title closes its dialog; one that started none keeps it open', () => {
  assert.equal(reencodeStarted(result({ reencoded: 1 })), true);
  assert.equal(reencodeStarted(result({ titles: 20, reencoded: 18, busy: 2 })), true);
  assert.equal(reencodeStarted(result({ busy: 1 })), false);
  assert.equal(reencodeStarted(result({ notSent: 1 })), false);
  assert.equal(reencodeStarted(result({ titles: 0 })), false);
});

test('the page says what katalog-manager did', () => {
  assert.equal(reencodeNotice(result({ message: 'encoding 3 of its 4 episodes with a file again' })),
    're-encode: encoding 3 of its 4 episodes with a file again');
});
