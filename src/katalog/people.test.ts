import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasEpisodeCounts } from './people.ts';

test('a film’s credits carry no episode counts', () => {
  assert.equal(hasEpisodeCounts([]), false);
  assert.equal(hasEpisodeCounts([{ episodeCount: null }, { episodeCount: null }]), false);
  assert.equal(hasEpisodeCounts([{}]), false);
});

test('a series’ credits do, even when only some have one', () => {
  assert.equal(hasEpisodeCounts([{ episodeCount: null }, { episodeCount: 6 }]), true);
  assert.equal(hasEpisodeCounts([{ episodeCount: 0 }]), true);
});
