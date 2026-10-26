import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FILTER,
  NO_SELECTION,
  RULE_ORDER,
  appendRows,
  checkState,
  emptyText,
  filterKey,
  filterVariables,
  findingText,
  fmtBytes,
  idleText,
  inQueue,
  inRuleOrder,
  isOnlyRule,
  isSelected,
  matchingScope,
  notCheckedHere,
  offersMatching,
  pageState,
  paceText,
  pickRule,
  pollMs,
  queueFacts,
  queueWord,
  queuedAny,
  queuedCounts,
  reworkButton,
  reworkText,
  reworkTitle,
  rowTitle,
  rowsScope,
  ruleLabel,
  select,
  selectedCount,
  selectionText,
  sizeChange,
  sizeText,
  sizesOf,
  withRule,
  workerName,
  type ComplianceFilter,
  type ComplianceRow,
  type QueueFacts,
  type Selection,
} from './compliance.ts';
import { meanwhileText } from './reencode.ts';

const GB = 1024 ** 3;

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

test('every rule has a label, in the order the tab lists them; an unknown one reads as its name', () => {
  assert.deepEqual(RULE_ORDER.map(ruleLabel), [
    'not packaged',
    'packaging failed',
    'over the bitrate cap',
    'over the size cap',
    'video not HEVC',
    'no surround track',
    'image subtitles missing',
  ]);
  assert.equal(ruleLabel('AUDIO_TOO_LOUD'), 'audio too loud');
  assert.deepEqual(inRuleOrder(['NO_SURROUND', 'ZZ_NEW', 'NOT_PACKAGED', 'AA_NEW', 'OVER_SIZE_CAP']), [
    'NOT_PACKAGED',
    'OVER_SIZE_CAP',
    'NO_SURROUND',
    'AA_NEW',
    'ZZ_NEW',
  ]);
  assert.deepEqual(
    inRuleOrder([{ rule: 'VIDEO_NOT_HEVC' }, { rule: 'OVER_BITRATE_CAP' }]).map((s) => s.rule),
    ['OVER_BITRATE_CAP', 'VIDEO_NOT_HEVC'],
  );
});

test('the filter asks for movies by default, every rule, any title', () => {
  assert.deepEqual(filterVariables(DEFAULT_FILTER), { kind: 'MOVIE', rules: null, search: null });
  assert.deepEqual(filterVariables({ kind: '', rules: ['NO_SURROUND', 'OVER_SIZE_CAP'], search: '  pine ' }), {
    kind: null,
    rules: ['OVER_SIZE_CAP', 'NO_SURROUND'],
    search: 'pine',
  });
  // the same titles asked for the same way: no change of the filter
  assert.equal(
    filterKey({ kind: 'MOVIE', rules: ['NO_SURROUND', 'OVER_SIZE_CAP'], search: 'pine' }),
    filterKey({ kind: 'MOVIE', rules: ['OVER_SIZE_CAP', 'NO_SURROUND'], search: ' pine  ' }),
  );
  assert.notEqual(filterKey(DEFAULT_FILTER), filterKey({ ...DEFAULT_FILTER, kind: 'EPISODE' }));
  assert.notEqual(filterKey(DEFAULT_FILTER), filterKey({ ...DEFAULT_FILTER, search: 'a' }));
});

test('a rule is ticked and unticked; the summary picks one alone, and the same again shows every rule', () => {
  assert.deepEqual(withRule([], 'NO_SURROUND', true), ['NO_SURROUND']);
  assert.deepEqual(withRule(['NO_SURROUND'], 'NOT_PACKAGED', true), ['NOT_PACKAGED', 'NO_SURROUND']);
  assert.deepEqual(withRule(['NOT_PACKAGED', 'NO_SURROUND'], 'NOT_PACKAGED', false), ['NO_SURROUND']);
  assert.deepEqual(withRule(['NO_SURROUND'], 'NO_SURROUND', true), ['NO_SURROUND']);
  assert.deepEqual(pickRule([], 'OVER_SIZE_CAP'), ['OVER_SIZE_CAP']);
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
    rowTitle(row({ kind: 'EPISODE', title: 'Chapter 2', year: 2021, seriesTitle: 'Pellam Bay', season: 1, episode: 2 })),
    'Pellam Bay · S01E02 · Chapter 2',
  );
  assert.equal(rowTitle(row({ kind: 'EPISODE', title: 'Chapter 9', seriesTitle: null, season: null, episode: 9 })), 'E09 · Chapter 9');
});

test('a finding says katalog-manager’s sentence, else the rule and what was measured', () => {
  const f = { rule: 'OVER_BITRATE_CAP' as const, text: 'video at 58 Mbit/s, over the 14 Mbit/s cap at 2160p', measured: '58 Mbit/s', limit: '14 Mbit/s' };
  assert.equal(findingText(f), 'video at 58 Mbit/s, over the 14 Mbit/s cap at 2160p');
  assert.equal(findingText({ ...f, text: '  ' }), 'over the bitrate cap: 58 Mbit/s, limit 14 Mbit/s');
  assert.equal(findingText({ ...f, text: '', limit: null }), 'over the bitrate cap: 58 Mbit/s');
  assert.equal(findingText({ rule: 'NOT_PACKAGED', text: '', measured: null, limit: null }), 'not packaged');
});

test('sizes read in steps of 1024, one decimal below 10', () => {
  assert.equal(fmtBytes(0), '0 B');
  assert.equal(fmtBytes(512), '512 B');
  assert.equal(fmtBytes(1536), '1.5 KB');
  assert.equal(fmtBytes(870 * 1024 ** 2), '870 MB');
  assert.equal(fmtBytes(GB), '1 GB');
  assert.equal(fmtBytes(4.24 * GB), '4.2 GB');
  assert.equal(fmtBytes(9.97 * GB), '10 GB');
  assert.equal(fmtBytes(59.4 * GB), '59 GB');
  assert.equal(fmtBytes(1023.7 * 1024 ** 2), '1 GB');
  assert.equal(fmtBytes(1.4 * 1024 * GB), '1.4 TB');
  assert.equal(fmtBytes(18.3 * 1024 * GB), '18 TB');
  for (const none of [null, undefined, NaN, -1, Infinity]) assert.equal(fmtBytes(none), '—', String(none));
  assert.equal(sizeText(0), '—');
  assert.equal(sizeText(null), '—');
  assert.equal(sizeText(2 * GB), '2 GB');
});

test('a package reads now and at most after, or as it is without an estimate', () => {
  assert.equal(sizeChange(59 * GB, 12 * GB), '59 GB → at most 12 GB');
  assert.equal(sizeChange(59 * GB, null), '59 GB');
  assert.equal(sizeChange(59 * GB, 0), '59 GB');
  assert.equal(sizeChange(null, 12 * GB), '— → at most 12 GB');
  assert.equal(sizeChange(0, null), '—');
});

test('the queue’s states read in words; a title waiting or sent is in it, one done or failed is not', () => {
  assert.equal(queueWord('queued'), 'queued');
  assert.equal(queueWord('sent'), 'encoding');
  assert.equal(queueWord('done'), 'done');
  assert.equal(queueWord('failed'), 'failed');
  assert.equal(queueWord(null), '');
  assert.equal(queueWord('paused'), 'paused');
  assert.equal(inQueue('queued'), true);
  assert.equal(inQueue('sent'), true);
  for (const q of ['done', 'failed', null, undefined]) assert.equal(inQueue(q), false, String(q));
});

// ---- the selection

const page = ['a', 'b', 'c'];
const run = (...actions: Parameters<typeof select>[1][]): Selection => actions.reduce(select, NO_SELECTION);

test('rows are ticked and unticked one at a time', () => {
  let s = run({ type: 'row', id: 'a', on: true, loaded: page }, { type: 'row', id: 'c', on: true, loaded: page });
  assert.deepEqual(s, { mode: 'rows', ids: ['a', 'c'] });
  assert.equal(isSelected(s, 'a'), true);
  assert.equal(isSelected(s, 'b'), false);
  assert.equal(selectedCount(s, 120), 2);
  assert.equal(selectionText(s, 120), '2 selected');
  assert.equal(pageState(s, page), 'some');
  s = select(s, { type: 'row', id: 'a', on: false, loaded: page });
  assert.deepEqual(s, { mode: 'rows', ids: ['c'] });
  // a row not shown, or one the queue holds, cannot be ticked
  assert.deepEqual(select(s, { type: 'row', id: 'zz', on: true, loaded: page }), { mode: 'rows', ids: ['c'] });
  assert.equal(pageState(NO_SELECTION, page), 'none');
  assert.equal(pageState(NO_SELECTION, []), 'none');
});

test('the header checkbox ticks the rows shown, and then every match is offered', () => {
  const s = run({ type: 'page', on: true, loaded: page });
  assert.deepEqual(s, { mode: 'rows', ids: page });
  assert.equal(pageState(s, page), 'all');
  assert.equal(offersMatching(s, page, 3, 120), true);
  // every match shown already: nothing more to offer
  assert.equal(offersMatching(s, page, 3, 3), false);
  // not every row shown ticked: not yet
  assert.equal(offersMatching(select(s, { type: 'row', id: 'b', on: false, loaded: page }), page, 3, 120), false);
  assert.equal(offersMatching(NO_SELECTION, [], 0, 120), false);
  assert.deepEqual(select(s, { type: 'page', on: false, loaded: page }), NO_SELECTION);
});

test('every match ticked counts the filter’s total, the rows not loaded too', () => {
  const s = run({ type: 'page', on: true, loaded: page }, { type: 'matching' });
  assert.deepEqual(s, { mode: 'matching' });
  assert.equal(selectedCount(s, 120), 120);
  assert.equal(selectionText(s, 120), 'all 120 matching selected');
  assert.equal(isSelected(s, 'a row loaded later'), true);
  assert.equal(pageState(s, page), 'all');
  assert.equal(offersMatching(s, page, 3, 120), false);
  // a refresh keeps it
  assert.deepEqual(select(s, { type: 'keep', loaded: ['a'] }), s);
  // ticking a row changes nothing; unticking one leaves the other rows shown
  assert.deepEqual(select(s, { type: 'row', id: 'a', on: true, loaded: page }), s);
  assert.deepEqual(select(s, { type: 'row', id: 'b', on: false, loaded: page }), { mode: 'rows', ids: ['a', 'c'] });
});

test('a change of the filter clears the selection, rows or every match', () => {
  for (const s of [run({ type: 'row', id: 'a', on: true, loaded: page }), run({ type: 'matching' })]) {
    assert.deepEqual(select(s, { type: 'clear' }), NO_SELECTION);
  }
});

test('a refresh keeps the rows still listed and ticked, and drops the others', () => {
  const s = run({ type: 'page', on: true, loaded: page });
  assert.deepEqual(select(s, { type: 'keep', loaded: ['a', 'c', 'd'] }), { mode: 'rows', ids: ['a', 'c'] });
  assert.equal(select(s, { type: 'keep', loaded: page }), s);
});

test('a page loaded after adds the rows not shown yet', () => {
  const got = appendRows([row({ itemId: 'a' }), row({ itemId: 'b' })], [row({ itemId: 'b' }), row({ itemId: 'c' })]);
  assert.deepEqual(got.map((r) => r.itemId), ['a', 'b', 'c']);
});

// ---- the confirm

const facts = (q: Partial<QueueFacts> = {}): QueueFacts => ({
  rate: null,
  inflight: null,
  window: null,
  intervalSeconds: null,
  queued: null,
  sent: null,
  idle: null,
  ...q,
});

test('the queue’s pace is what katalog-manager’s settings say, and only that', () => {
  const settings = [
    { key: 'library.reencode.rate', valueText: '2' },
    { key: ' library.reencode.inflight ', valueText: ' 3 ' },
    { key: 'library.reencode.window', valueText: '23:00 - 07:00' },
    { key: 'tmdb.api_key', valueText: null },
  ];
  const q = queueFacts(settings, 30, { queued: 4, sent: 2, idle: ' outside library.reencode.window (23:00-07:00) ' });
  assert.deepEqual(q, { rate: 2, inflight: 3, window: '23:00-07:00', intervalSeconds: 30, queued: 4, sent: 2, idle: 'outside library.reencode.window (23:00-07:00)' });
  assert.equal(paceText(q), 'up to 2 titles every 30s, no more than 3 at once, between 23:00 and 07:00 server time');
  assert.equal(paceText({ ...q, rate: 1, intervalSeconds: 300, inflight: null, window: null }), 'up to 1 title every 5m');
  // without the sweep's interval a number a pass says nothing
  assert.equal(paceText({ ...q, intervalSeconds: null, window: null }), 'no more than 3 at once');
  // a window that starts where it ends is the whole day
  assert.equal(paceText(facts({ window: '04:00-04:00' })), '');

  // nothing set, or nothing katalog-manager reads (it uses its own value): nothing said
  const none = queueFacts([], 30, null);
  assert.deepEqual(none, facts({ intervalSeconds: 30 }));
  assert.equal(paceText(none), '');
  const unread = queueFacts(
    [
      { key: 'library.reencode.rate', valueText: '0' },
      { key: 'library.reencode.inflight', valueText: 'four' },
      { key: 'library.reencode.window', valueText: 'nights' },
    ],
    0,
    { queued: 0, sent: 0, idle: '' },
  );
  assert.deepEqual(unread, facts({ queued: 0, sent: 0 }));
  assert.equal(paceText(null), '');
});

const GOING = [
  'they go through the re-encode queue, which sends them on at its own pace: up to 2 titles every 30s, no more than 2 at once.',
  'in the queue now: 4 queued, 2 encoding.',
];

test('the confirm of one title says what it encodes, its sizes, the queue, what plays meanwhile', () => {
  const q = facts({ rate: 2, inflight: 2, intervalSeconds: 30 });
  assert.deepEqual(reworkText(rowsScope([row({})]), q), [
    'encodes “Vellmar Station (2019)” again with this instance’s current pipeline settings, the transcoder’s and then the packager’s.',
    'its package takes 59 GB now, at most 12 GB after the rework.',
    'it goes through the re-encode queue, which sends it on at its own pace: up to 2 titles every 30s, no more than 2 at once.',
    meanwhileText(),
    'while a transcode or package of it is running, it stays queued.',
  ]);
  assert.equal(reworkTitle(rowsScope([row({})])), 'rework 1 title');
  assert.equal(reworkButton(rowsScope([row({})])), 'rework');

  // a title without a package plays by on-demand transcoding throughout
  const unpackaged = reworkText(rowsScope([row({ packageBytes: null })]), null);
  assert.equal(unpackaged[1], 'it has no package now, and takes at most 12 GB after the rework.');
  assert.equal(unpackaged[2], 'it goes through the re-encode queue, which sends it on at its own pace.');
  assert.equal(unpackaged[3], 'it plays by on-demand transcoding until its package is complete.');
  // no estimate: the size now only
  assert.equal(reworkText(rowsScope([row({ estimatedBytes: null })]), null)[1], 'its package takes 59 GB now.');
});

test('the confirm of rows says how many, their sizes, and the queue’s pace and state', () => {
  const rows = [row({ itemId: 'a' }), row({ itemId: 'b', packageBytes: 41 * GB, estimatedBytes: 9 * GB })];
  const q = facts({ rate: 2, inflight: 2, intervalSeconds: 30, queued: 4, sent: 2 });
  const text = reworkText(rowsScope(rows), q);
  assert.deepEqual(text, [
    'encodes these 2 titles again with this instance’s current pipeline settings, the transcoder’s and then the packager’s.',
    'their packages take 100 GB now, at most 21 GB after the rework.',
    ...GOING,
    meanwhileText('title'),
    'a title whose transcode or package is running stays queued, and the next one goes.',
  ]);
  assert.equal(reworkTitle(rowsScope(rows)), 'rework 2 titles');
  assert.equal(reworkButton(rowsScope(rows)), 'rework 2');

  // the queue sends none now: it says why
  assert.equal(
    reworkText(rowsScope(rows), { ...q, idle: 'no event bus: KAFKA_BROKERS is not set' })[3],
    'in the queue now: 4 queued, 2 encoding. the queue sends none right now: no event bus: KAFKA_BROKERS is not set.',
  );
  // some without an estimate: the estimate is of those that have one
  assert.equal(
    reworkText(rowsScope([...rows, row({ itemId: 'c', packageBytes: 20 * GB, estimatedBytes: null })]), null)[1],
    'their packages take 120 GB now; the 2 of them with an estimate take at most 21 GB after the rework.',
  );
  // one without a package: what it plays meanwhile is said too
  const mixed = reworkText(rowsScope([...rows, row({ itemId: 'c', packageBytes: null })]), null);
  assert.equal(mixed[3], `${meanwhileText('title')} a title without a package plays by on-demand transcoding until its package is complete.`);
});

test('why the queue sends none: outside its hours in words, any other reason as katalog-manager gives it', () => {
  const outside = 'outside library.reencode.window (23:00-07:00)';
  assert.equal(idleText(facts({ window: '23:00-07:00', idle: outside })), 'the queue sends none right now: that is outside those hours.');
  // without the window in the pace, "those hours" would name none: the reason as it is
  assert.equal(idleText(facts({ idle: outside })), 'the queue sends none right now: outside library.reencode.window (23:00-07:00).');
  assert.equal(idleText(facts({ window: '23:00-07:00', idle: 'library.reencode.rate is 0.' })), 'the queue sends none right now: library.reencode.rate is 0.');
  assert.equal(idleText(facts({})), '');
  assert.equal(idleText(null), '');
  const text = reworkText(rowsScope([row({})]), facts({ window: '23:00-07:00', idle: outside, queued: 1 }));
  assert.equal(text[2], 'it goes through the re-encode queue, which sends it on at its own pace: between 23:00 and 07:00 server time.');
  assert.equal(text[3], 'in the queue now: 1 queued. the queue sends none right now: that is outside those hours.');
});

const report = { total: 240, nextCursor: 'c100', summary: [
  { rule: 'OVER_SIZE_CAP' as const, titles: 180, packageBytes: 9000 * GB, estimatedBytes: 2400 * GB },
  { rule: 'NO_SURROUND' as const, titles: 240, packageBytes: 9600 * GB, estimatedBytes: null },
] };

test('the confirm of every match says how many, and its sizes only where they are known', () => {
  const f: ComplianceFilter = { ...DEFAULT_FILTER };
  const all = matchingScope(report, f, [row({})]);
  assert.equal(all.titles, 240);
  assert.equal(all.packageBytes, null);
  const text = reworkText(all, null);
  assert.equal(text[0], 'encodes all 240 matching titles again with this instance’s current pipeline settings, the transcoder’s and then the packager’s.');
  // the sizes of 240 titles of which 1 is loaded are not known: not said
  assert.equal(text[1], 'they go through the re-encode queue, which sends them on at its own pace.');
  // a filter of every rule may hold titles without a package
  assert.match(text[2], /a title without a package plays by on-demand transcoding/);
  assert.equal(reworkTitle(all), 'rework 240 titles');

  // one rule picked: its line of the summary counts the same titles
  const size = matchingScope({ ...report, total: 180 }, { ...f, rules: ['OVER_SIZE_CAP'] }, [row({})]);
  assert.equal(size.packageBytes, 9000 * GB);
  assert.equal(reworkText(size, null)[1], 'their packages take 8.8 TB now, at most 2.3 TB after the rework.');
  assert.doesNotMatch(reworkText(size, null).join(' '), /without a package/);
  // a line that counts other titles than the total says nothing
  assert.equal(matchingScope({ ...report, total: 170 }, { ...f, rules: ['OVER_SIZE_CAP'] }, []).packageBytes, null);

  // every match loaded: the rows' sizes
  const loaded = matchingScope({ ...report, total: 1, nextCursor: null }, f, [row({})]);
  assert.equal(loaded.matching, true);
  assert.equal(loaded.packageBytes, 59 * GB);
  assert.equal(reworkText(loaded, null)[0], 'encodes “Vellmar Station (2019)” again with this instance’s current pipeline settings, the transcoder’s and then the packager’s.');
});

test('the sizes of titles: their packages, the estimates of those with one, and one without a package', () => {
  assert.deepEqual(sizesOf([]), { packageBytes: 0, estimatedBytes: null, estimated: 0, sized: 0, withoutPackage: false });
  assert.deepEqual(
    sizesOf([
      { packageBytes: 59 * GB, estimatedBytes: 12 * GB },
      { packageBytes: 20 * GB, estimatedBytes: null },
      { packageBytes: null, estimatedBytes: 9 * GB },
    ]),
    { packageBytes: 79 * GB, estimatedBytes: 21 * GB, estimated: 2, sized: 3, withoutPackage: true },
  );
  // every match counted page by page: the confirm says their sizes
  const counted = { ...matchingScope(report, DEFAULT_FILTER, []), ...sizesOf([{ packageBytes: 40 * GB, estimatedBytes: 10 * GB }]) };
  assert.equal(reworkText(counted, null)[1], 'their packages take 40 GB now, at most 10 GB after the rework.');
});

test('after queueing, the tab says the counts; one that took none keeps the confirm open', () => {
  const r = { queued: 10, alreadyQueued: 2, skipped: 1, message: 'queued 10 titles' };
  assert.equal(queuedCounts(r), '10 queued · 2 queued already · 1 skipped');
  assert.equal(queuedAny(r), true);
  assert.equal(queuedAny({ ...r, queued: 0 }), true);
  assert.equal(queuedAny({ ...r, queued: 0, alreadyQueued: 0 }), false);
});

// ---- the report's states

test('an older katalog-manager’s validation errors are a catalog that does not check its rules', () => {
  // graph-gophers' messages, as gql joins them
  assert.equal(notCheckedHere('Unknown type "ComplianceKind".; Unknown type "ComplianceRule".; Cannot query field "libraryCompliance" on type "Query".'), true);
  assert.equal(notCheckedHere('Cannot query field "libraryCompliance" on type "Query".'), true);
  assert.equal(notCheckedHere('Unknown type "ComplianceRule".'), true);
  assert.equal(notCheckedHere('Cannot query field "queueReworkMatching" on type "Mutation".'), true);
  // anything else is an error: the report's own fields, a failure, nothing
  assert.equal(notCheckedHere('Cannot query field "estimatedBytes" on type "ComplianceRow".'), false);
  assert.equal(notCheckedHere('katalog-manager 502'), false);
  assert.equal(notCheckedHere('Failed to fetch'), false);
  assert.equal(notCheckedHere(null), false);
  assert.equal(notCheckedHere(''), false);
});

test('the check is running, done, or never ran', () => {
  assert.equal(checkState({ evaluating: true, evaluatedAt: null }), 'checking');
  assert.equal(checkState({ evaluating: true, evaluatedAt: '2026-10-26T08:00:00Z' }), 'checking');
  assert.equal(checkState({ evaluating: false, evaluatedAt: '2026-10-26T08:00:00Z' }), 'checked');
  assert.equal(checkState({ evaluating: false, evaluatedAt: null }), 'never');
});

test('with no title listed the tab says why', () => {
  const checked = { evaluatedAt: '2026-10-26T08:00:00Z', notEvaluated: [] };
  assert.equal(emptyText(checked, DEFAULT_FILTER), 'every movie follows the rules.');
  assert.equal(emptyText(checked, { ...DEFAULT_FILTER, kind: 'EPISODE' }), 'every episode follows the rules.');
  assert.equal(emptyText(checked, { ...DEFAULT_FILTER, kind: '' }), 'every title follows the rules.');
  assert.equal(
    emptyText({ ...checked, notEvaluated: ['the packager has not reported its rules'] }, DEFAULT_FILTER),
    'every movie follows the rules that were checked.',
  );
  assert.equal(emptyText(checked, { ...DEFAULT_FILTER, search: ' pine ' }), 'no movie matching “pine” breaks the rules.');
  assert.equal(emptyText(checked, { ...DEFAULT_FILTER, kind: '', rules: ['NO_SURROUND'] }), 'no title breaks the rules picked.');
  // never checked: the rules panel says so, the list does not again
  assert.equal(emptyText({ ...checked, evaluatedAt: null }, DEFAULT_FILTER), '');
});

test('the tab reads the report again while a check runs, and slowly while a title is in the queue', () => {
  assert.equal(pollMs(null, []), 0);
  assert.equal(pollMs({ evaluating: true }, []), 5_000);
  assert.equal(pollMs({ evaluating: false }, [{ queue: null }, { queue: 'sent' }]), 30_000);
  assert.equal(pollMs({ evaluating: false }, [{ queue: 'done' }, { queue: 'failed' }, { queue: null }]), 0);
});

test('a worker is headed by the pipeline’s word for it, with its own name when that is another', () => {
  assert.equal(workerName('transcoder', { worker: 'transcoder' }), 'transcoder');
  assert.equal(workerName('transcoder', { worker: ' ' }), 'transcoder');
  assert.equal(workerName('packager', { worker: 'packager-hls' }), 'packager (packager-hls)');
});
