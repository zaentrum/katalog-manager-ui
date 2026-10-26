import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLEARED_FILTER,
  CONFIRM_BODY,
  DEFAULT_FILTER,
  KIND_OPTIONS,
  NO_SELECTION,
  RULE_ORDER,
  announceText,
  appendRows,
  checkState,
  confirmFacts,
  countText,
  emptyState,
  filterKey,
  filterVariables,
  findingText,
  fmtBytes,
  fmtCount,
  hiddenCount,
  inQueue,
  inRuleOrder,
  isFiltering,
  isOnlyRule,
  isSelected,
  loadFailure,
  matchingScope,
  notCheckedHere,
  offersMatching,
  outcomeText,
  pageState,
  pickRule,
  pollMs,
  processLabel,
  queueParts,
  queuedAny,
  queuedToasts,
  rowStatus,
  rowTitle,
  rowsScope,
  ruleLabel,
  ruleOption,
  select,
  selectedCount,
  selectionText,
  sentenceCase,
  sizeChange,
  sizeText,
  staleText,
  titlesOf,
  withRule,
  workerName,
  type ComplianceFinding,
  type ComplianceRow,
  type Selection,
} from './compliance.ts';

const GB = 1e9;
const NB = ' ';

const row = (r: Partial<ComplianceRow>): ComplianceRow => ({
  itemId: 'm1',
  title: 'Vellmar Station',
  year: 2019,
  kind: 'MOVIE',
  seriesId: null,
  seriesTitle: null,
  season: null,
  episode: null,
  findings: [],
  originalBytes: 64 * GB,
  packageBytes: 59 * GB,
  estimatedBytes: 12 * GB,
  queue: null,
  evaluatedAt: '2026-10-26T08:00:00Z',
  ...r,
});
const breaking = (...rules: ComplianceFinding['rule'][]) => rules.map((rule) => ({ rule, text: 'x', measured: null, limit: null }));

test('counts carry thousands separators, and the titles of a kind are counted in their own words', () => {
  assert.equal(fmtCount(2500), '2,500');
  assert.equal(fmtCount(7), '7');
  assert.equal(titlesOf('MOVIE', 230), '230 movies');
  assert.equal(titlesOf('MOVIE', 1), '1 movie');
  assert.equal(titlesOf('EPISODE', 2), '2 episodes');
  assert.equal(titlesOf('', 1), '1 title');
  assert.equal(titlesOf('', 2409), '2,409 titles');
  assert.equal(sentenceCase('video not HEVC'), 'Video not HEVC');
});

test('every rule has a label in the monospace voice and an option in the body face, in the tab’s order', () => {
  assert.deepEqual(RULE_ORDER.map(ruleLabel), [
    'not packaged',
    'packaging failed',
    'over the bitrate cap',
    'over the size cap',
    'video not HEVC',
    'no surround track',
    'image subtitles missing',
  ]);
  assert.deepEqual(RULE_ORDER.map(ruleOption).slice(2, 5), ['Over the bitrate cap', 'Over the size cap', 'Video not HEVC']);
  assert.equal(ruleLabel('AUDIO_TOO_LOUD'), 'audio too loud');
  assert.deepEqual(inRuleOrder(['NO_SURROUND', 'ZZ_NEW', 'NOT_PACKAGED', 'AA_NEW', 'OVER_SIZE_CAP']), [
    'NOT_PACKAGED',
    'OVER_SIZE_CAP',
    'NO_SURROUND',
    'AA_NEW',
    'ZZ_NEW',
  ]);
});

test('the filter asks for movies by default; "clear all" asks for every kind, rule and title', () => {
  assert.deepEqual(filterVariables(DEFAULT_FILTER), { kind: 'MOVIE', rules: null, search: null });
  assert.deepEqual(filterVariables({ kind: '', rules: ['NO_SURROUND', 'OVER_SIZE_CAP'], search: '  pine ' }), {
    kind: null,
    rules: ['OVER_SIZE_CAP', 'NO_SURROUND'],
    search: 'pine',
  });
  assert.equal(
    filterKey({ kind: 'MOVIE', rules: ['NO_SURROUND', 'OVER_SIZE_CAP'], search: 'pine' }),
    filterKey({ kind: 'MOVIE', rules: ['OVER_SIZE_CAP', 'NO_SURROUND'], search: ' pine  ' }),
  );
  // movies filter: "clear all" works from the start
  assert.equal(isFiltering(DEFAULT_FILTER), true);
  assert.equal(isFiltering(CLEARED_FILTER), false);
  assert.equal(isFiltering({ ...CLEARED_FILTER, search: '  ' }), false);
  assert.equal(isFiltering({ ...CLEARED_FILTER, rules: ['NO_SURROUND'] }), true);
  // the option that filters nothing comes first
  assert.deepEqual(KIND_OPTIONS.map((o) => o.label), ['all', 'movies', 'episodes']);
});

test('the filter bar counts what is left of every title, or the total alone', () => {
  assert.equal(countText(230, 2279), '230 of 2,279');
  assert.equal(countText(2279, 2279), '2,279');
  assert.equal(countText(230, null), '230');
  assert.equal(countText(0, 12), '0 of 12');
  // no title breaks a rule at all: the empty state says it, the count nothing
  assert.equal(countText(0, 0), '');
  assert.equal(countText(0, null), '');
});

test('a rule is ticked and unticked; the summary picks one alone, and the same again shows every rule', () => {
  assert.deepEqual(withRule([], 'NO_SURROUND', true), ['NO_SURROUND']);
  assert.deepEqual(withRule(['NO_SURROUND'], 'NOT_PACKAGED', true), ['NOT_PACKAGED', 'NO_SURROUND']);
  assert.deepEqual(withRule(['NOT_PACKAGED', 'NO_SURROUND'], 'NOT_PACKAGED', false), ['NO_SURROUND']);
  assert.deepEqual(pickRule(['NO_SURROUND', 'OVER_SIZE_CAP'], 'OVER_SIZE_CAP'), ['OVER_SIZE_CAP']);
  assert.deepEqual(pickRule(['OVER_SIZE_CAP'], 'OVER_SIZE_CAP'), []);
  assert.equal(isOnlyRule(['OVER_SIZE_CAP'], 'OVER_SIZE_CAP'), true);
  assert.equal(isOnlyRule(['OVER_SIZE_CAP', 'NO_SURROUND'], 'OVER_SIZE_CAP'), false);
});

test('a movie reads with its year, an episode with its series and place', () => {
  assert.equal(rowTitle(row({})), 'Vellmar Station (2019)');
  assert.equal(rowTitle(row({ year: null })), 'Vellmar Station');
  assert.equal(rowTitle(row({ title: ' ', year: null })), '(untitled)');
  assert.equal(
    rowTitle(row({ kind: 'EPISODE', title: 'Chapter 2', seriesTitle: 'Pellam Bay', season: 1, episode: 2 })),
    'Pellam Bay · S01E02 · Chapter 2',
  );
});

test('a finding says katalog-manager’s sentence, else the rule and what was measured, in sentence case', () => {
  const f = { rule: 'OVER_BITRATE_CAP' as const, text: 'Video at 58 Mbit/s, above the 14 Mbit/s the transcoder allows', measured: '58 Mbit/s', limit: '14 Mbit/s' };
  assert.equal(findingText(f), 'Video at 58 Mbit/s, above the 14 Mbit/s the transcoder allows');
  assert.equal(findingText({ ...f, text: '  ' }), 'Over the bitrate cap: 58 Mbit/s, limit 14 Mbit/s');
  assert.equal(findingText({ rule: 'NOT_PACKAGED', text: '', measured: null, limit: null }), 'Not packaged');
});

test('what processing again does to a title, from the rules it breaks', () => {
  const capsChecked = true;
  assert.equal(outcomeText(row({ findings: breaking('OVER_BITRATE_CAP') }), capsChecked), 'Re-encoded, then packaged again');
  assert.equal(outcomeText(row({ findings: breaking('OVER_SIZE_CAP') }), capsChecked), 'Re-encoded, then packaged again');
  assert.equal(outcomeText(row({ findings: breaking('VIDEO_NOT_HEVC') }), capsChecked), 'Re-encoded, then packaged again');
  // within the caps: the video is copied
  assert.equal(outcomeText(row({ findings: breaking('NO_SURROUND') }), capsChecked), 'Packaged again; the video is copied');
  assert.equal(outcomeText(row({ findings: breaking('IMAGE_SUBTITLES_MISSING') }), capsChecked), 'Packaged again; the video is copied');
  // a cap rule with them: re-encoded
  assert.equal(outcomeText(row({ findings: breaking('NO_SURROUND', 'OVER_SIZE_CAP') }), capsChecked), 'Re-encoded, then packaged again');
  // caps not checked: the video's fate isn't known, so not said
  assert.equal(outcomeText(row({ findings: breaking('NO_SURROUND') }), false), 'Packaged again');
  assert.equal(outcomeText(row({ findings: breaking('NOT_PACKAGED'), packageBytes: null }), capsChecked), 'Packaged for the first time');
  // never packaged comes first, a cap rule or not
  assert.equal(outcomeText(row({ findings: breaking('NOT_PACKAGED', 'OVER_BITRATE_CAP'), packageBytes: null }), capsChecked), 'Packaged for the first time');
  // packaging failed: packaged again when there is a package, else for the first time
  assert.equal(outcomeText(row({ findings: breaking('PACKAGING_FAILED') }), capsChecked), 'Packaged again; the video is copied');
  assert.equal(outcomeText(row({ findings: breaking('PACKAGING_FAILED') }), false), 'Packaged again');
  assert.equal(outcomeText(row({ findings: breaking('PACKAGING_FAILED'), packageBytes: null }), capsChecked), 'Packaged for the first time');
  assert.equal(outcomeText(row({ findings: breaking('PACKAGING_FAILED', 'VIDEO_NOT_HEVC') }), capsChecked), 'Re-encoded, then packaged again');
  assert.equal(outcomeText(row({ findings: [{ rule: 'SOMETHING_NEW' as ComplianceFinding['rule'], text: 'x', measured: null, limit: null }] }), capsChecked), '');
});

test('a row’s status in the status vocabulary’s words; a title done has none', () => {
  assert.deepEqual(rowStatus('queued'), { word: 'queued', tone: 'blue', detail: null });
  assert.deepEqual(rowStatus('sent'), { word: 'processing', tone: 'blue', detail: null });
  assert.deepEqual(rowStatus('failed'), { word: 'needs attention', tone: 'amber', detail: 'Processing failed' });
  assert.equal(rowStatus('done'), null);
  assert.equal(rowStatus(null), null);
  assert.equal(inQueue('queued'), true);
  assert.equal(inQueue('sent'), true);
  for (const q of ['done', 'failed', null, undefined]) assert.equal(inQueue(q), false, String(q));
});

test('the queue in numbers and words, the counts there are', () => {
  const parts = queueParts({ queued: 6, processing: 2, processed: 1234, failed: 1 });
  assert.deepEqual(parts.map((p) => `${p.count} ${p.word}`), ['6 queued', '2 processing', '1 needs attention', '1,234 processed again']);
  assert.deepEqual(parts.map((p) => p.tone), ['blue', 'blue', 'amber', null]);
  assert.deepEqual(queueParts({ queued: 0, processing: 0, processed: 0, failed: 0 }), []);
});

// ---- the selection

const a = row({ itemId: 'a' });
const b = row({ itemId: 'b' });
const c = row({ itemId: 'c' });
const q = row({ itemId: 'q', queue: 'queued' });
const page = [a, b, c, q];
const run = (...actions: Parameters<typeof select>[1][]): Selection => actions.reduce(select, NO_SELECTION);
const ids = (s: Selection) => (s.mode === 'rows' ? s.rows.map((r) => r.itemId) : s.mode);

test('rows are ticked one at a time; one the queue holds can’t be', () => {
  let s = run({ type: 'row', row: a, on: true, loaded: page }, { type: 'row', row: c, on: true, loaded: page });
  assert.deepEqual(ids(s), ['a', 'c']);
  assert.equal(isSelected(s, a), true);
  assert.equal(isSelected(s, b), false);
  assert.equal(selectedCount(s, 120), 2);
  assert.equal(pageState(s, page), 'some');
  s = select(s, { type: 'row', row: a, on: false, loaded: page });
  assert.deepEqual(ids(s), ['c']);
  assert.equal(select(s, { type: 'row', row: q, on: true, loaded: page }), s);
  assert.equal(isSelected(s, q), false);
});

test('the header checkbox ticks the rows on screen; only then is every match offered, and pressed again it clears', () => {
  const s = run({ type: 'page', on: true, rows: page });
  assert.deepEqual(ids(s), ['a', 'b', 'c']);
  assert.equal(pageState(s, page), 'all');
  assert.equal(offersMatching(s, page, 248), true);
  // every match is on screen already: nothing more to offer
  assert.equal(offersMatching(s, page, 4), false);
  // not every row on screen ticked: not offered
  assert.equal(offersMatching(run({ type: 'row', row: a, on: true, loaded: page }), page, 248), false);
  assert.equal(offersMatching(NO_SELECTION, [], 248), false);
  assert.deepEqual(select(s, { type: 'page', on: false, rows: page }), NO_SELECTION);
});

test('every match ticked counts all that match, the rows not loaded too', () => {
  const key = filterKey(DEFAULT_FILTER);
  const s = run({ type: 'page', on: true, rows: page }, { type: 'matching', key });
  assert.deepEqual(s, { mode: 'matching', key });
  assert.equal(selectedCount(s, 248), 248);
  assert.equal(selectionText(selectedCount(s, 248), hiddenCount(s, page)), '248 selected');
  assert.equal(isSelected(s, row({ itemId: 'loaded later' })), true);
  assert.equal(isSelected(s, q), false);
  assert.equal(pageState(s, page), 'all');
  assert.equal(offersMatching(s, page, 248), false);
  // unticking a row leaves the other rows on screen
  assert.deepEqual(ids(select(s, { type: 'row', row: b, on: false, loaded: page })), ['a', 'c']);
});

test('a filter change keeps the ticked rows, counting those hidden; every match of another filter goes', () => {
  const rows = run({ type: 'row', row: a, on: true, loaded: page }, { type: 'row', row: b, on: true, loaded: page });
  const other = filterKey({ ...DEFAULT_FILTER, search: 'pine' });
  const kept = select(rows, { type: 'filter', key: other });
  assert.equal(kept, rows);
  // the new filter shows only b and a new row
  const shown = [b, row({ itemId: 'd' })];
  assert.equal(hiddenCount(kept, shown), 1);
  assert.equal(selectionText(selectedCount(kept, 99), hiddenCount(kept, shown)), '2 selected · 1 hidden by filters');
  const all = run({ type: 'matching', key: filterKey(DEFAULT_FILTER) });
  assert.deepEqual(select(all, { type: 'filter', key: other }), NO_SELECTION);
  assert.equal(select(all, { type: 'filter', key: filterKey(DEFAULT_FILTER) }), all);
});

test('rows read again: a ticked row is kept as it is now, and drops out once the queue holds it', () => {
  const s = run({ type: 'page', on: true, rows: page });
  const aNow = row({ itemId: 'a', packageBytes: 58 * GB });
  const bQueued = row({ itemId: 'b', queue: 'sent' });
  const next = select(s, { type: 'loaded', rows: [aNow, bQueued] });
  assert.deepEqual(ids(next), ['a', 'c']);
  assert.equal(next.mode === 'rows' && next.rows[0], aNow);
  // nothing new: the same selection
  assert.equal(select(next, { type: 'loaded', rows: [aNow] }), next);
});

test('the count is read out after each change, and the clear is said', () => {
  assert.equal(announceText(12), '12 selected');
  assert.equal(announceText(2409), '2,409 selected');
  assert.equal(announceText(0), 'selection cleared');
});

// ---- processing again

test('the bulk button, the confirm’s title and its button name the count', () => {
  assert.equal(processLabel(12), 'process 12 titles again');
  assert.equal(processLabel(1), 'process 1 title again');
  assert.equal(processLabel(2409), 'process 2,409 titles again');
  assert.equal(
    CONFIRM_BODY,
    "Each title is processed again from its original, with today's settings, one after another. Its current version keeps playing until the new one is ready, and the original isn't changed.",
  );
});

test('the confirm’s facts: the one title’s name, the packages now and at most after', () => {
  assert.deepEqual(confirmFacts(rowsScope([a])), [
    { label: 'title', value: 'Vellmar Station (2019)' },
    { label: 'package', value: `59${NB}GB → at most 12${NB}GB` },
  ]);
  const two = rowsScope([a, row({ itemId: 'b', packageBytes: 41 * GB, estimatedBytes: null })]);
  assert.deepEqual(two, { titles: 2, name: null, packageBytes: 100 * GB, estimatedBytes: 12 * GB });
  assert.deepEqual(confirmFacts(two), [{ label: 'packages', value: `100${NB}GB → at most 12${NB}GB` }]);
  // every match: the report's totals over all of them
  const all = matchingScope({ titles: 248, originalBytes: 9e12, packageBytes: 8.8e12, estimatedBytes: 2.3e12 });
  assert.equal(all.titles, 248);
  assert.deepEqual(confirmFacts(all), [{ label: 'packages', value: `8.8${NB}TB → at most 2.3${NB}TB` }]);
  // never packaged: none now, at most after
  assert.deepEqual(confirmFacts(rowsScope([row({ packageBytes: null })])).at(-1), { label: 'package', value: `— → at most 12${NB}GB` });
  assert.deepEqual(confirmFacts({ titles: 3, name: null, packageBytes: 0, estimatedBytes: null }), []);
});

test('after queueing, a toast counts what was queued; what the queue held or skipped follows in a plain one', () => {
  assert.deepEqual(queuedToasts({ queued: 12, alreadyQueued: 0, skipped: 0, message: '' }), [
    { state: 'success', text: '12 titles queued to be processed again.' },
  ]);
  assert.deepEqual(queuedToasts({ queued: 1, alreadyQueued: 0, skipped: 0, message: '' }), [
    { state: 'success', text: '1 title queued to be processed again.' },
  ]);
  assert.deepEqual(queuedToasts({ queued: 10, alreadyQueued: 2, skipped: 1, message: '' }), [
    { state: 'success', text: '10 titles queued to be processed again.' },
    { state: 'neutral', text: '2 in the queue already · 1 skipped' },
  ]);
  assert.deepEqual(queuedToasts({ queued: 0, alreadyQueued: 3, skipped: 0, message: '' }), [
    { state: 'neutral', text: '3 in the queue already' },
  ]);
  // nothing queued nor held: no toast, the page says it failed
  assert.deepEqual(queuedToasts({ queued: 0, alreadyQueued: 0, skipped: 4, message: 'no file' }), []);
  assert.equal(queuedAny({ queued: 0, alreadyQueued: 0, skipped: 4, message: '' }), false);
  assert.equal(queuedAny({ queued: 0, alreadyQueued: 1, skipped: 0, message: '' }), true);
});

// ---- sizes

test('sizes as chino’s downloads write them: decimal, GB with one decimal and no trailing zero, MB below 1 GB', () => {
  assert.equal(fmtBytes(1.4 * GB), `1.4${NB}GB`);
  assert.equal(fmtBytes(18 * GB), `18${NB}GB`);
  assert.equal(fmtBytes(12.44 * GB), `12.4${NB}GB`);
  assert.equal(fmtBytes(724e6), `724${NB}MB`);
  assert.equal(fmtBytes(281.4e6), `281${NB}MB`);
  // 999.6 MB rounds to a GB, not "1000 MB"
  assert.equal(fmtBytes(999.6e6), `1${NB}GB`);
  // never "0 MB" for something there is
  assert.equal(fmtBytes(1), `1${NB}MB`);
  assert.equal(fmtBytes(0), `0${NB}MB`);
  // decimal units: 1 GiB is 1.1 GB
  assert.equal(fmtBytes(1024 ** 3), `1.1${NB}GB`);
  // past 1,000 GB the same rule in TB
  assert.equal(fmtBytes(999.4 * GB), `999.4${NB}GB`);
  assert.equal(fmtBytes(999.96 * GB), `1${NB}TB`);
  assert.equal(fmtBytes(6.43e12), `6.4${NB}TB`);
  for (const none of [null, undefined, NaN, -1, Infinity]) assert.equal(fmtBytes(none), '—', String(none));
  assert.equal(sizeText(0), '—');
  assert.equal(sizeText(2 * GB), `2${NB}GB`);
});

test('a package reads now and at most after, or as it is without an estimate', () => {
  assert.equal(sizeChange(59 * GB, 12 * GB), `59${NB}GB → at most 12${NB}GB`);
  assert.equal(sizeChange(59 * GB, null), `59${NB}GB`);
  assert.equal(sizeChange(null, 12 * GB), `— → at most 12${NB}GB`);
  assert.equal(sizeChange(0, null), '—');
});

// ---- the report's states

const gqlError = (message: string) => Object.assign(new Error(message), { name: 'GqlError' });

test('an older katalog-manager’s validation errors are a katalog-manager without the rules check', () => {
  assert.equal(notCheckedHere('Unknown type "ComplianceKind".; Cannot query field "libraryCompliance" on type "Query".'), true);
  assert.equal(notCheckedHere('Unknown type "ComplianceRule".'), true);
  assert.equal(notCheckedHere('Cannot query field "queueReworkMatching" on type "Mutation".'), true);
  assert.equal(notCheckedHere('Cannot query field "matching" on type "ComplianceReport".'), false);
  assert.equal(notCheckedHere(null), false);
  assert.deepEqual(loadFailure(gqlError('Cannot query field "libraryCompliance" on type "Query".')), {
    title: "couldn't load the rules",
    reason: 'This katalog-manager has no rules check.',
    retry: false,
    detail: 'Cannot query field "libraryCompliance" on type "Query".',
  });
});

test('a list that couldn’t load says why, by the HTTP status, the reason only', () => {
  const why = (e: unknown) => loadFailure(e).reason;
  assert.equal(why(new TypeError('Failed to fetch')), "Can't reach the server.");
  assert.equal(why(new Error('katalog-manager 408')), "Can't reach the server.");
  assert.equal(why(new Error('katalog-manager 429')), 'The server is busy.');
  assert.equal(why(new Error('katalog-manager 500')), 'The server ran into a problem.');
  assert.equal(why(new Error('katalog-manager 502')), 'The server ran into a problem.');
  // a 404 on a list: the app and the server don't match
  assert.equal(why(new Error('katalog-manager 404')), "The server didn't accept the request. Check for an app update.");
  assert.equal(why(new Error('katalog-manager 400')), "The server didn't accept the request. Check for an app update.");
  assert.deepEqual(loadFailure(new Error('katalog-manager 403')), { title: "you don't have access to this", reason: '', retry: false, detail: 'HTTP 403' });
  assert.equal(loadFailure(new Error('katalog-manager 502')).detail, 'HTTP 502');
  assert.equal(loadFailure(new Error('katalog-manager 502')).title, "couldn't load the rules");
  // a query this katalog-manager doesn't take, and a problem it ran into
  assert.equal(why(gqlError('Cannot query field "matching" on type "ComplianceReport".')), "The server didn't accept the request.");
  assert.equal(why(gqlError('pq: connection refused')), 'The server ran into a problem.');
  assert.equal(loadFailure(gqlError('pq: connection refused')).detail, 'pq: connection refused');
  assert.equal(why('something else'), 'The server ran into a problem.');
});

test('a refresh that failed says how old the list on the screen is', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  assert.equal(staleText(now - 4 * 60_000, now), "Couldn't refresh the list; it shows what was loaded 4m ago.");
  assert.equal(staleText(null, now), "Couldn't refresh the list.");
});

test('the check is running, done, or never ran', () => {
  assert.equal(checkState({ evaluating: true, evaluatedAt: null }), 'checking');
  assert.equal(checkState({ evaluating: false, evaluatedAt: '2026-10-26T08:00:00Z' }), 'checked');
  assert.equal(checkState({ evaluating: false, evaluatedAt: null }), 'never');
});

test('with no title listed, the table’s place says which kind of empty it is', () => {
  const checked = { evaluating: false, evaluatedAt: '2026-10-26T08:00:00Z', notEvaluated: [] };
  assert.deepEqual(emptyState(checked, DEFAULT_FILTER), { kind: 'done', title: 'nothing breaks the rules', text: 'Every movie follows the rules.' });
  assert.equal(emptyState(checked, { ...DEFAULT_FILTER, kind: 'EPISODE' })?.text, 'Every episode follows the rules.');
  assert.equal(emptyState(checked, CLEARED_FILTER)?.text, 'Every title follows the rules.');
  assert.equal(
    emptyState({ ...checked, notEvaluated: ["The transcoder hasn't reported its rules."] }, DEFAULT_FILTER)?.text,
    'Every movie follows the rules that were checked.',
  );
  assert.deepEqual(emptyState(checked, { ...DEFAULT_FILTER, search: 'pine' }), {
    kind: 'nomatch',
    title: 'no matches',
    text: 'Nothing in this list matches the search and filters.',
  });
  assert.equal(emptyState(checked, { ...DEFAULT_FILTER, rules: ['NO_SURROUND'] })?.kind, 'nomatch');
  assert.deepEqual(emptyState({ ...checked, evaluatedAt: null }, DEFAULT_FILTER), {
    kind: 'unknown',
    title: 'not checked',
    text: "The titles haven't been checked against the rules.",
  });
  // the first check runs: the facts line says so, nothing more
  assert.equal(emptyState({ ...checked, evaluatedAt: null, evaluating: true }, DEFAULT_FILTER), null);
});

test('the tab reads the report again while a check runs, and slowly while the queue holds titles', () => {
  const idle = { queued: 0, processing: 0, processed: 9, failed: 1 };
  assert.equal(pollMs(null, []), 0);
  assert.equal(pollMs({ evaluating: true, queue: idle }, []), 5_000);
  assert.equal(pollMs({ evaluating: false, queue: idle }, [{ queue: 'sent' }]), 30_000);
  assert.equal(pollMs({ evaluating: false, queue: { ...idle, processing: 2 } }, []), 30_000);
  assert.equal(pollMs({ evaluating: false, queue: idle }, [{ queue: 'done' }, { queue: 'failed' }]), 0);
});

test('a page loaded after adds the rows not shown yet; a worker is headed by its word', () => {
  assert.deepEqual(appendRows([a, b], [b, c]).map((r) => r.itemId), ['a', 'b', 'c']);
  assert.equal(workerName('transcoder', { worker: 'transcoder' }), 'transcoder');
  assert.equal(workerName('packager', { worker: 'packager-hls' }), 'packager (packager-hls)');
});
