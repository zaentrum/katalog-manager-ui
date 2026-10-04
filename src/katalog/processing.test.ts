import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STEP_ORDER,
  ago,
  attemptsText,
  canRetry,
  catalogItemHref,
  episodeState,
  failedTitle,
  inPipelineOrder,
  policyText,
  retryState,
  seasonSummary,
  seasonsOf,
  stepLabel,
  stepOptions,
  stepTotal,
  timeoutText,
  until,
  type EpisodeRow,
} from './processing.ts';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const at = (sec: number) => new Date(NOW + sec * 1000).toISOString();

test('every step has a short label, and an unknown one keeps its name', () => {
  assert.deepEqual(
    STEP_ORDER.map(stepLabel),
    ['Scan', 'Metadata', 'Intro Lookup', 'Chapters', 'Fingerprints', 'Black Frames', 'Silence', 'Subtitles', 'Transcode', 'Package'],
  );
  assert.equal(stepLabel('rescan'), 'rescan');
  const opts = stepOptions();
  assert.deepEqual(opts[0], { label: 'All Steps', value: '' });
  assert.equal(opts.length, STEP_ORDER.length + 1);
  assert.deepEqual(opts[9], { label: 'Transcode', value: 'transcode' });
});

test('steps come in pipeline order, an unknown one after, by name', () => {
  const got = inPipelineOrder([{ step: 'package' }, { step: 'zz' }, { step: 'tmdb' }, { step: 'aa' }, { step: 'subtitle' }]);
  assert.deepEqual(got.map((s) => s.step), ['tmdb', 'subtitle', 'package', 'aa', 'zz']);
});

test('only a failed step is offered a retry', () => {
  for (const status of ['pending', 'in_progress', 'done', 'skipped', 'not_applicable']) assert.equal(canRetry({ status }), false, status);
  assert.equal(canRetry({ status: 'failed' }), true);
});

test('times read short, before and after now', () => {
  assert.equal(ago(at(-2), NOW), 'just now');
  assert.equal(ago(at(-45), NOW), '45s ago');
  assert.equal(ago(at(-180), NOW), '3m ago');
  assert.equal(ago(at(-(2 * 3600 + 5 * 60)), NOW), '2h 5m ago');
  assert.equal(ago(at(-3 * 86400 - 3600), NOW), '3d 1h ago');
  assert.equal(ago(null, NOW), '');
  assert.equal(ago('not a time', NOW), '');
  assert.equal(until(at(120), NOW), 'in 2m');
  assert.equal(until(at(3600), NOW), 'in 1h');
  assert.equal(until(at(-30), NOW), 'now');
  assert.equal(until(undefined, NOW), '');
  assert.equal(timeoutText(900), '15m');
  assert.equal(timeoutText(7200), '2h');
  assert.equal(timeoutText(5400), '1h 30m');
});

test('attempts read of the policy’s when it is known', () => {
  assert.equal(attemptsText(2, 3), '2 of 3');
  assert.equal(attemptsText(2, null), '2');
  assert.equal(attemptsText(0), '0');
});

test('a step’s retry: its next, due, none left, none scheduled, or sent again', () => {
  const failed = { status: 'failed', failures: 1, nextRetryAt: at(120) };
  assert.equal(retryState(failed, 3, NOW), 'retry in 2m');
  assert.equal(retryState({ ...failed, nextRetryAt: at(-5) }, 3, NOW), 'retry due');
  assert.equal(retryState({ ...failed, failures: 3, nextRetryAt: null }, 3, NOW), 'no retry left');
  assert.equal(retryState({ ...failed, failures: 1, nextRetryAt: null }, 3, NOW), 'no automatic retry');
  assert.equal(retryState({ ...failed, failures: 2, nextRetryAt: null }, 3, NOW), 'no automatic retry');
  assert.equal(retryState({ ...failed, failures: 4, nextRetryAt: null }, null, NOW), 'no automatic retry');
  assert.equal(retryState({ status: 'pending', failures: 1, nextRetryAt: null, dispatchedAt: at(-180) }, 3, NOW), 'sent again 3m ago');
  assert.equal(retryState({ status: 'pending', failures: 0, nextRetryAt: null, dispatchedAt: null }, 3, NOW), '');
  assert.equal(retryState({ status: 'done', failures: 0, nextRetryAt: null }, 3, NOW), '');
});

test('a failed step’s item reads with its series and place', () => {
  assert.equal(failedTitle({ itemTitle: 'Earthfall', seriesTitle: 'Pioneer One', seasonNumber: 1, episodeNumber: 2 }), 'Pioneer One · S01E02 · Earthfall');
  assert.equal(failedTitle({ itemTitle: 'Sintel' }), 'Sintel');
  assert.equal(failedTitle({ itemTitle: 'Pilot', seriesTitle: 'A Show', seasonNumber: null, episodeNumber: 1 }), 'A Show · E01 · Pilot');
  assert.equal(failedTitle({ itemTitle: '' }), '(untitled)');
});

test('the management app links an item to the catalog app beside it', () => {
  assert.equal(catalogItemHref('/katalog-manage', 'm1'), '/katalog/item/m1');
  assert.equal(catalogItemHref('/katalog-manage/', 'a b'), '/katalog/item/a%20b');
  assert.equal(catalogItemHref('/katalog', 'm1'), '/katalog/item/m1');
  assert.equal(catalogItemHref('', 'm1'), '/item/m1');
});

test('a step’s total counts every state', () => {
  assert.equal(
    stepTotal({ step: 'x', pending: 1, inProgress: 2, done: 3, failed: 4, skipped: 5, notApplicable: 6, retrying: 99, stalled: 99, timeoutSeconds: 1 }),
    21,
  );
});

test('the policy line says how the service retries, or why it cannot', () => {
  const r = { available: true, automatic: true, reason: null, maxAttempts: 3, backoffSeconds: 60, backoffMaxSeconds: 3600, intervalSeconds: 30 };
  assert.equal(policyText(r), 'automatic retries: 3 attempts in a row, waiting 1m doubling to 1h, checked every 30s');
  assert.equal(policyText({ ...r, automatic: false }), 'no automatic retries: a failed step is retried by hand');
  assert.equal(
    policyText({ ...r, available: false, automatic: false, reason: 'no event bus: KAFKA_BROKERS is not set' }),
    'retries unavailable: no event bus: KAFKA_BROKERS is not set',
  );
});

const ep = (id: string, s: number | null, e: number | null, status: string | null, title = id): EpisodeRow => ({
  id,
  title,
  seasonNumber: s,
  episodeNumber: e,
  isPackaged: status === 'complete',
  overallStatus: status ? { overallStatus: status } : null,
});

test('a series’ episodes come in seasons, numbered first, then specials, then those without', () => {
  const seasons = seasonsOf([
    ep('s2e1', 2, 1, 'complete'),
    ep('s1e2', 1, 2, 'failed'),
    ep('sp1', 0, 1, 'queued'),
    ep('s1e1', 1, 1, 'complete'),
    ep('x', null, null, null),
    ep('s1b', 1, null, 'processing', 'Bonus'),
    ep('s1a', 1, null, 'processing', 'Aside'),
  ]);
  assert.deepEqual(seasons.map((s) => s.label), ['Season 1', 'Season 2', 'Specials', 'No Season']);
  assert.deepEqual(seasons[0].episodes.map((e) => e.id), ['s1e1', 's1e2', 's1a', 's1b']);
  assert.deepEqual(seasons[0].states, { failed: 1, complete: 1, processing: 2 });
  assert.equal(seasonSummary(seasons[0]), '4 episodes · 1 failed · 2 processing · 1 complete');
  assert.equal(seasonSummary(seasons[3]), '1 episode · 1 unknown');
  assert.equal(episodeState(ep('a', 1, 1, null)), 'unknown');
  assert.equal(seasonSummary(seasonsOf([ep('a', 1, 1, 'partial_failure'), ep('b', 1, 2, 'not_applicable')])[0]),
    '2 episodes · 1 partial failure · 1 not applicable');
  assert.deepEqual(seasonsOf([]), []);
});
