import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLEARED_FILTER,
  DEFAULT_FILTER,
  DEFAULT_ORDER,
  KIND_OPTIONS,
  NO_SELECTION,
  RULE_ORDER,
  announceText,
  appendRows,
  ariaSort,
  bitrateText,
  blockedReason,
  canProcess,
  checkCounts,
  checkState,
  confirmBody,
  confirmFacts,
  countText,
  csvFileName,
  csvQuery,
  csvUrl,
  dispositionName,
  emptyState,
  filterKey,
  filterVariables,
  findingText,
  fmtBitrate,
  fmtBytes,
  fmtCount,
  hiddenCount,
  inQueue,
  inRuleOrder,
  isBlocked,
  isFiltering,
  isOnlyRule,
  isSelected,
  loadFailure,
  matchingScope,
  nextOrder,
  notCheckedHere,
  notQueuedBanner,
  nowAndAfter,
  offersMatching,
  outcomeTag,
  pageState,
  pickRule,
  pollMs,
  processLabel,
  queueParts,
  queuedToasts,
  rowControlNames,
  rowDetails,
  rowName,
  rowStatus,
  rowTitle,
  rowsScope,
  ruleTag,
  savingBytes,
  select,
  selectedCount,
  selectionText,
  signedSizeText,
  ESTIMATE,
  localWindow,
  refusedMatching,
  deletesOriginals,
  originalsAre,
  PROCESS_WORDS,
  sizeText,
  staleText,
  summaryNote,
  summaryWithoutEstimate,
  titlesOf,
  withRule,
  workerName,
  type ComplianceFinding,
  type ComplianceRow,
  type ComplianceSummary,
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
  queueReason: null,
  queueDetail: null,
  reworkBlocked: null,
  resolution: '3840×2160',
  videoCodec: 'HEVC',
  videoBitrate: 58e6,
  videoBitrateEstimated: false,
  bitrateCap: 14e6,
  packageAudio: '5.1 E-AC-3 + 2.0 AAC',
  originalAudio: '7.1 TrueHD',
  outcome: null,
  evaluatedAt: '2026-10-26T08:00:00Z',
  ...r,
});
const breaking = (...rules: ComplianceFinding['rule'][]) => rules.map((rule) => ({ rule, text: 'x', measured: null, limit: null, detail: null }));

test('counts carry thousands separators, and the titles of a kind are counted in their own words', () => {
  assert.equal(fmtCount(2500), '2,500');
  assert.equal(fmtCount(7), '7');
  assert.equal(titlesOf('MOVIE', 230), '230 movies');
  assert.equal(titlesOf('MOVIE', 1), '1 movie');
  assert.equal(titlesOf('EPISODE', 2), '2 episodes');
  assert.equal(titlesOf('', 1), '1 title');
  assert.equal(titlesOf('', 2409), '2,409 titles');
});

test('every rule has one short tag in the monospace voice, the same everywhere, in the tab’s order', () => {
  assert.deepEqual(RULE_ORDER.map(ruleTag), [
    'not packaged',
    'packaging failed',
    'bit rate > cap',
    'size > cap',
    'not HEVC',
    'no surround',
    'image subs missing',
  ]);
  assert.equal(ruleTag('AUDIO_TOO_LOUD'), 'audio too loud');
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

test('the filter bar counts what is left of every title while something filters, and nothing else', () => {
  assert.equal(countText(230, 2279, true), '230 of 2,279');
  assert.equal(countText(2279, 2279, true), '2,279 of 2,279');
  assert.equal(countText(0, 12, true), '0 of 12');
  // nothing filters: the table's heading counts them
  assert.equal(countText(2279, 2279, false), '');
  // every title not known: no count to set it against
  assert.equal(countText(230, null, true), '');
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

test('a movie reads with its year, an episode with its series and place, the table’s column without the episode’s title', () => {
  assert.equal(rowTitle(row({})), 'Vellmar Station (2019)');
  assert.equal(rowTitle(row({ year: null })), 'Vellmar Station');
  assert.equal(rowTitle(row({ title: ' ', year: null })), '(untitled)');
  const episode = row({ kind: 'EPISODE', title: 'Chapter 2', seriesTitle: 'Pellam Bay', season: 1, episode: 2 });
  assert.equal(rowTitle(episode), 'Pellam Bay · S01E02 · Chapter 2');
  assert.equal(rowName(episode), 'Pellam Bay · S01E02');
  assert.equal(rowName(row({})), 'Vellmar Station (2019)');
  // an episode with nothing to place it: its own title
  assert.equal(rowName({ ...episode, seriesTitle: null, season: null, episode: null }), 'Chapter 2');
});

test('the measures in figures: bit rates in Mbit/s, an estimated one marked, the cap, the saving', () => {
  assert.equal(fmtBitrate(34.8e6), `34.8${NB}Mbit/s`);
  assert.equal(fmtBitrate(8e6), `8${NB}Mbit/s`);
  assert.equal(fmtBitrate(14.04e6), `14${NB}Mbit/s`);
  assert.equal(fmtBitrate(640e3), `640${NB}kbit/s`);
  for (const none of [null, undefined, 0, -1, NaN]) assert.equal(fmtBitrate(none), '—', String(none));
  assert.equal(bitrateText(row({ videoBitrate: 34.8e6 })), `34.8${NB}Mbit/s`);
  assert.equal(bitrateText(row({ videoBitrate: 34.8e6, videoBitrateEstimated: true })), `≈${NB}34.8${NB}Mbit/s`);
  assert.equal(bitrateText(row({ videoBitrate: null, videoBitrateEstimated: true })), '—');
  // what processing again frees, as estimated: the package less its estimate after
  assert.equal(savingBytes(row({})), 47 * GB);
  assert.equal(savingBytes(row({ estimatedBytes: null })), null);
  assert.equal(savingBytes(row({ packageBytes: null })), null);
  // a package that may grow, as katalog-manager sorts it: less than nothing, with its sign
  assert.equal(savingBytes(row({ packageBytes: 4.6 * GB, estimatedBytes: 6.144 * GB })), 4.6 * GB - 6.144 * GB);
  assert.equal(signedSizeText(4.6 * GB - 6.144 * GB), `−1.5${NB}GB`);
  assert.equal(signedSizeText(64.6 * GB), `64.6${NB}GB`);
  assert.equal(signedSizeText(0), `0${NB}MB`);
  assert.equal(signedSizeText(null), '—');
  // the estimates are marked once, in their headers, not in their cells
  assert.deepEqual(ESTIMATE, { after: `≈${NB}after`, saving: `≈${NB}saving`, tip: 'Estimated: the package’s size after processing again' });
});

test('a finding in words for the row’s details: katalog-manager’s sentence, else what was measured against the limit', () => {
  const f = {
    text: 'The video runs at 58 Mbit/s, above the 14 Mbit/s the transcoder allows for a 2160p movie.',
    measured: '58 Mbit/s',
    limit: '14 Mbit/s',
  };
  assert.equal(findingText(f), 'The video runs at 58 Mbit/s, above the 14 Mbit/s the transcoder allows for a 2160p movie.');
  assert.equal(findingText({ ...f, text: '  ' }), '58 Mbit/s, limit 14 Mbit/s');
  assert.equal(findingText({ text: '', measured: null, limit: null }), '');
});

test('a row’s details: each finding’s words and technical part by its tag, why it is blocked, the queue’s part, the original’s audio', () => {
  const h264 = { rule: 'VIDEO_NOT_HEVC' as const, text: 'The video is H.264, and the transcoder makes every video HEVC.', measured: 'H.264', limit: 'HEVC', detail: ' avc1.640028 ' };
  const size = { rule: 'OVER_SIZE_CAP' as const, text: 'The original is larger than the 16.1 GB the transcoder allows for a movie.', measured: null, limit: '16.1 GB', detail: null };
  assert.deepEqual(rowDetails(row({ findings: [h264, size], queue: 'failed', queueDetail: 'ffmpeg exited 1' })), [
    { label: 'size > cap', text: 'The original is larger than the 16.1 GB the transcoder allows for a movie.', detail: null },
    { label: 'not HEVC', text: 'The video is H.264, and the transcoder makes every video HEVC.', detail: 'avc1.640028' },
    { label: 'status', text: '', detail: 'ffmpeg exited 1' },
    { label: 'original audio', text: '7.1 TrueHD', detail: null },
  ]);
  // processing again can't help: why, by "blocked"
  assert.deepEqual(rowDetails(row({ findings: breaking('PACKAGING_FAILED'), reworkBlocked: 'its file is a disc image', originalAudio: null })), [
    { label: 'packaging failed', text: 'x', detail: null },
    { label: 'blocked', text: 'its file is a disc image', detail: null },
  ]);
  // the queue's part explains a status the row shows; a title done shows none
  assert.deepEqual(rowDetails(row({ findings: [], queue: 'done', queueDetail: 'ffmpeg exited 1', originalAudio: ' ' })), []);
});

test('what processing again does, as a tag: katalog-manager’s outcome, "blocked" for a title it can’t help, else from the rules', () => {
  assert.equal(outcomeTag(row({ outcome: 'REENCODE' })), 're-encode');
  assert.equal(outcomeTag(row({ outcome: 'REPACKAGE' })), 'repackage');
  assert.equal(outcomeTag(row({ outcome: 'FIRST_PACKAGE' })), 'package');
  assert.equal(outcomeTag(row({ outcome: 'BLOCKED' })), 'blocked');
  // the server's reason blocks whatever its outcome says
  assert.equal(outcomeTag(row({ outcome: 'REENCODE', reworkBlocked: 'its original was deleted after packaging' })), 'blocked');
  // no outcome told: from the rules the title breaks
  assert.equal(outcomeTag(row({ findings: breaking('OVER_BITRATE_CAP') })), 're-encode');
  assert.equal(outcomeTag(row({ findings: breaking('NO_SURROUND', 'OVER_SIZE_CAP') })), 're-encode');
  assert.equal(outcomeTag(row({ findings: breaking('NO_SURROUND') })), 'repackage');
  assert.equal(outcomeTag(row({ findings: breaking('IMAGE_SUBTITLES_MISSING') })), 'repackage');
  assert.equal(outcomeTag(row({ findings: breaking('NOT_PACKAGED', 'OVER_BITRATE_CAP'), packageBytes: null })), 'package');
  assert.equal(outcomeTag(row({ findings: breaking('PACKAGING_FAILED') })), 'repackage');
  assert.equal(outcomeTag(row({ findings: breaking('PACKAGING_FAILED'), packageBytes: null })), 'package');
  assert.equal(outcomeTag(row({ findings: [{ rule: 'SOMETHING_NEW' as ComplianceFinding['rule'], text: 'x', measured: null, limit: null, detail: null }] })), '');
});

test('a title processing again can’t help: the server’s clause, with a full stop or spaces the same, or its outcome', () => {
  assert.equal(blockedReason(row({ reworkBlocked: ' its file is a disc image. ' })), 'its file is a disc image');
  assert.equal(blockedReason(row({ reworkBlocked: '  ' })), null);
  assert.equal(blockedReason(row({})), null);
  assert.equal(isBlocked(row({ reworkBlocked: 'it has no file' })), true);
  assert.equal(isBlocked(row({ outcome: 'BLOCKED' })), true);
  assert.equal(isBlocked(row({ reworkBlocked: ' ', outcome: 'REENCODE' })), false);
});

test('a title can be ticked and processed again when the queue doesn’t hold it and processing again can help', () => {
  assert.equal(canProcess(row({})), true);
  assert.equal(canProcess(row({ queue: 'done' })), true);
  assert.equal(canProcess(row({ queue: 'failed' })), true);
  assert.equal(canProcess(row({ queue: 'queued' })), false);
  assert.equal(canProcess(row({ queue: 'sent' })), false);
  assert.equal(canProcess(row({ reworkBlocked: 'its file is a disc image' })), false);
  assert.equal(canProcess(row({ queue: 'failed', reworkBlocked: 'its original was deleted after packaging' })), false);
  assert.equal(canProcess(row({ outcome: 'BLOCKED' })), false);
});

test('a row’s checkbox and button are named by what they do, and a title processing again can’t help says why', () => {
  assert.deepEqual(rowControlNames(row({})), { select: 'select Vellmar Station (2019)', process: 'process again: Vellmar Station (2019)' });
  assert.deepEqual(rowControlNames(row({ reworkBlocked: 'its video is Dolby Vision profile 7, which needs a tone-mapping encode' })), {
    select: 'select Vellmar Station (2019). Can’t be processed again: its video is Dolby Vision profile 7, which needs a tone-mapping encode.',
    process: 'process again: Vellmar Station (2019). Can’t be processed again: its video is Dolby Vision profile 7, which needs a tone-mapping encode.',
  });
  // blocked with no reason told
  assert.equal(rowControlNames(row({ outcome: 'BLOCKED' })).select, 'select Vellmar Station (2019). Can’t be processed again.');
});

test('a row’s status in the status vocabulary’s words, the queue’s reason as katalog-manager says it; a title done has none', () => {
  assert.deepEqual(rowStatus('queued'), { word: 'queued', tone: 'blue', detail: null });
  assert.deepEqual(rowStatus('sent'), { word: 'processing', tone: 'blue', detail: null });
  assert.deepEqual(rowStatus('failed'), { word: 'needs attention', tone: 'amber', detail: 'Processing failed.' });
  // what a title waits for, and why it failed: the server's sentence as it is
  assert.equal(rowStatus('queued', 'It is waiting for the transcoder.')?.detail, 'It is waiting for the transcoder.');
  assert.equal(rowStatus('sent', ' The packager is working on it. ')?.detail, 'The packager is working on it.');
  assert.equal(rowStatus('failed', 'The transcoder failed.')?.detail, 'The transcoder failed.');
  assert.equal(rowStatus('failed', '  ')?.detail, 'Processing failed.');
  assert.equal(rowStatus('done', 'The transcoder failed.'), null);
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
  // 248 the queue doesn't hold: more than the 3 on screen that can be ticked
  assert.equal(offersMatching(s, page, 248), true);
  // every title that could be queued is on screen and ticked: nothing more to offer
  assert.equal(offersMatching(s, page, 3), false);
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
  // processing it again can't help any more: it drops out too
  assert.deepEqual(ids(select(next, { type: 'loaded', rows: [row({ itemId: 'c', reworkBlocked: 'it has no file' })] })), ['a']);
});

test('every way of selecting leaves out a title processing again can’t help, and counts without it', () => {
  const disc = row({ itemId: 'x', reworkBlocked: 'its file is a disc image' });
  const shown = [a, disc, b, q];
  // one at a time: it can't be ticked
  assert.equal(select(NO_SELECTION, { type: 'row', row: disc, on: true, loaded: shown }), NO_SELECTION);
  // the header checkbox ticks the others, and shows a tick once they are all ticked
  const s = run({ type: 'page', on: true, rows: shown });
  assert.deepEqual(ids(s), ['a', 'b']);
  assert.equal(selectionText(selectedCount(s, 250), hiddenCount(s, shown)), '2 selected');
  assert.equal(pageState(s, shown), 'all');
  assert.equal(isSelected(s, disc), false);
  // select all is offered while the queue would take more than the 2 on screen (queueable leaves it out)
  assert.equal(offersMatching(s, shown, 2), false);
  assert.equal(offersMatching(s, shown, 248), true);
  // every match ticked: it stays unticked, and the count is queueable's
  const all = select(s, { type: 'matching', key: filterKey(DEFAULT_FILTER) });
  assert.equal(isSelected(all, disc), false);
  assert.equal(selectedCount(all, 248), 248);
  // unticking a row of every match keeps the others that can be ticked, and not it
  assert.deepEqual(ids(select(all, { type: 'row', row: a, on: false, loaded: shown })), ['b']);
  // nothing on screen can be ticked: the header checkbox has nothing to tick
  assert.equal(pageState(NO_SELECTION, [disc, q]), 'none');
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
});

const keep = { originals: 'keep', inflight: 4, window: null };
const deleted = { originals: 'delete-after-package', inflight: 4, window: null };

test('the confirm’s body, in the UX session’s words, as this installation processes titles', () => {
  assert.equal(
    confirmBody(12, keep),
    'Each title is processed again from its original, with today’s settings, 4 at a time. Its current version keeps playing until the new one is ready, and the original isn’t changed.',
  );
  assert.equal(
    confirmBody(1, keep),
    'The title is processed again from its original, with today’s settings. Its current version keeps playing until the new one is ready, and the original isn’t changed.',
  );
  assert.equal(
    confirmBody(12, deleted),
    'Each title is processed again from its original, with today’s settings, 4 at a time. Its current version keeps playing until the new one is ready. Then the original is deleted, as this server is set to do, and can’t be brought back.',
  );
  assert.equal(
    confirmBody(1, deleted),
    'The title is processed again from its original, with today’s settings. Its current version keeps playing until the new one is ready. Then the original is deleted, as this server is set to do, and can’t be brought back.',
  );
  assert.equal(deletesOriginals(deleted), true);
  assert.equal(deletesOriginals(keep), false);
  // the pace as the queue's inflight is, and left out while it isn't known
  assert.equal(PROCESS_WORDS.pace(1), ', 1 at a time');
  assert.equal(PROCESS_WORDS.pace(0), '');
  assert.equal(
    confirmBody(3, { ...keep, inflight: null }),
    'Each title is processed again from its original, with today’s settings. Its current version keeps playing until the new one is ready, and the original isn’t changed.',
  );
  // a setting the console doesn't know, or none: no word on the original, nor danger
  assert.equal(originalsAre({ originals: 'archive' }), 'unknown');
  assert.equal(originalsAre(null), 'unknown');
  assert.equal(
    confirmBody(2, null),
    'Each title is processed again from its original, with today’s settings. Its current version keeps playing until the new one is ready.',
  );
  assert.equal(deletesOriginals(null), false);
});

test('the queue’s window, in the viewer’s time, before the first sentence’s full stop, of one title too', () => {
  const cet = 60; // minutes east of UTC
  assert.equal(
    confirmBody(12, { ...keep, window: '00:00Z-05:00Z' }, cet),
    'Each title is processed again from its original, with today’s settings, 4 at a time, between 01:00 and 06:00. Its current version keeps playing until the new one is ready, and the original isn’t changed.',
  );
  assert.equal(
    confirmBody(1, { ...deleted, window: '00:00Z-05:00Z' }, cet),
    'The title is processed again from its original, with today’s settings, between 01:00 and 06:00. Its current version keeps playing until the new one is ready. Then the original is deleted, as this server is set to do, and can’t be brought back.',
  );
  // its zone given each way, and across midnight
  assert.equal(localWindow('23:00+01:00-07:00+01:00', -300), 'between 17:00 and 01:00');
  assert.equal(localWindow('22:00-06:00 UTC', cet), 'between 23:00 and 07:00');
  assert.equal(localWindow('22:00Z – 06:00Z', 0), 'between 22:00 and 06:00');
  // no zone: as it is written
  assert.equal(localWindow('23:00-07:00', -300), 'between 23:00 and 07:00');
  assert.equal(localWindow('1:00-6:00', cet), 'between 01:00 and 06:00');
  // none, or one the console can't read
  for (const w of [null, '', 'nights', '25:00-07:00']) assert.equal(localWindow(w, cet), '', String(w));
});

test('the confirm’s facts, in the UX session’s words: the packages now and about after, and those with no estimate', () => {
  assert.deepEqual(confirmFacts(rowsScope([row({ packageBytes: 78.8 * GB, estimatedBytes: 11.9 * GB })])), [
    { label: 'title', value: 'Vellmar Station (2019)' },
    { label: 'package', value: `78.8${NB}GB now, about 11.9${NB}GB after` },
  ]);
  // now and after over the same titles, those with an estimate, as the report's totals are
  const two = rowsScope([a, row({ itemId: 'b', packageBytes: 41 * GB, estimatedBytes: null })]);
  assert.deepEqual(two, { titles: 2, name: null, packageBytes: 59 * GB, estimatedBytes: 12 * GB, withoutEstimate: 1 });
  assert.deepEqual(confirmFacts(two), [{ label: 'packages', value: `59${NB}GB now, about 12${NB}GB after; 1 title has no estimate` }]);
  // none with an estimate: no sizes to compare, how many have none
  assert.deepEqual(confirmFacts(rowsScope([row({ itemId: 'c', estimatedBytes: null }), row({ itemId: 'd', estimatedBytes: null })])), [
    { label: 'packages', value: '2 titles have no estimate' },
  ]);
  // every match: the report's totals over all of them the queue would take
  const all = matchingScope({ titles: 248, originalBytes: 9e12, packageBytes: 5.93e12, estimatedBytes: 1.3e12, withoutEstimate: 3, fingerprint: 'x' });
  assert.equal(all.titles, 248);
  assert.deepEqual(confirmFacts(all), [{ label: 'packages', value: `5.9${NB}TB now, about 1.3${NB}TB after; 3 titles have no estimate` }]);
  assert.deepEqual(confirmFacts({ ...all, withoutEstimate: 0 }), [{ label: 'packages', value: `5.9${NB}TB now, about 1.3${NB}TB after` }]);
  // no package: about after only; no estimate: now, and none
  assert.deepEqual(confirmFacts(rowsScope([row({ packageBytes: null, estimatedBytes: 7.1 * GB })])).at(-1), { label: 'package', value: `about 7.1${NB}GB after` });
  assert.deepEqual(confirmFacts(rowsScope([row({ packageBytes: 78.8 * GB, estimatedBytes: null })])).at(-1), { label: 'package', value: `78.8${NB}GB now; no estimate` });
  assert.equal(nowAndAfter(59 * GB, null), `59${NB}GB now`);
  assert.equal(nowAndAfter(null, null), '');
  assert.deepEqual(confirmFacts({ titles: 3, name: null, packageBytes: 0, estimatedBytes: null, withoutEstimate: 0 }), []);
});

test('under the summary, in the confirm’s words, the titles its packages now and after leave out, each once', () => {
  const by = (rule: ComplianceSummary['rule'], withoutEstimate: number): ComplianceSummary => ({
    rule,
    titles: 12,
    packageBytes: 59 * GB,
    estimatedBytes: 12 * GB,
    withoutEstimate,
  });
  // 3 and 2 of the rows, 4 titles: one breaks both rules, and is counted once
  const summary = [by('NO_SURROUND', 3), by('VIDEO_NOT_HEVC', 2), by('OVER_SIZE_CAP', 0)];
  assert.equal(summaryWithoutEstimate(null, { withoutEstimate: 4 }, undefined), 4);
  assert.equal(summaryWithoutEstimate([], { withoutEstimate: 4 }, undefined), 4);
  assert.equal(summaryNote(summary, 4), '4 titles have no estimate');
  assert.equal(summaryNote(summary, 1), '1 title has no estimate');
  assert.equal(summaryNote(summary, 2409), '2,409 titles have no estimate');
  // a rule picked lists its titles alone, the summary stays every rule's:
  // the read of every rule's beside the report counts them
  assert.equal(summaryWithoutEstimate(['VIDEO_NOT_HEVC'], { withoutEstimate: 2 }, { withoutEstimate: 4 }), 4);
  assert.equal(summaryWithoutEstimate(['VIDEO_NOT_HEVC'], { withoutEstimate: 2 }, undefined), null);
  assert.equal(summaryNote(summary, null), '');
  // none left out: no line
  assert.equal(summaryNote([by('NO_SURROUND', 0), by('VIDEO_NOT_HEVC', 0)], 0), '');
  assert.equal(summaryNote([by('NO_SURROUND', 0)], 3), '');
  assert.equal(summaryNote(summary, 0), '');
  assert.equal(summaryNote([], 0), '');
});

const result = (r: Partial<Parameters<typeof queuedToasts>[0]>) => ({
  queued: 0,
  alreadyQueued: 0,
  skipped: 0,
  skippedTitles: [],
  message: '',
  queuedText: null,
  alreadyText: null,
  notQueuedText: null,
  ...r,
});

test('after queueing, the toasts are katalog-manager’s: what was queued, then, plain, what the queue held already', () => {
  assert.deepEqual(queuedToasts(result({ queued: 12, queuedText: '12 titles queued to be processed again' })), [
    { state: 'success', text: '12 titles queued to be processed again' },
  ]);
  assert.deepEqual(
    queuedToasts(result({ queued: 10, alreadyQueued: 3, queuedText: '10 titles queued to be processed again', alreadyText: '3 titles already in the queue' })),
    [
      { state: 'success', text: '10 titles queued to be processed again' },
      { state: 'neutral', text: '3 titles already in the queue' },
    ],
  );
  // nothing queued: no success toast
  assert.deepEqual(queuedToasts(result({ alreadyQueued: 1, alreadyText: '1 title already in the queue' })), [
    { state: 'neutral', text: '1 title already in the queue' },
  ]);
  // titles not queued are no toast: the banner says it
  assert.deepEqual(queuedToasts(result({ skipped: 4, notQueuedText: '4 titles weren’t queued: they have no file.' })), []);
  assert.deepEqual(queuedToasts(result({ notQueuedText: 'Nothing was queued: no title was selected.' })), []);
});

test('a server that counts without saying it gets the toasts in the same words from the counts', () => {
  assert.deepEqual(queuedToasts(result({ queued: 12 })), [{ state: 'success', text: '12 titles queued to be processed again' }]);
  assert.deepEqual(queuedToasts(result({ queued: 1, alreadyQueued: 1, alreadyText: '  ' })), [
    { state: 'success', text: '1 title queued to be processed again' },
    { state: 'neutral', text: '1 title already in the queue' },
  ]);
  assert.deepEqual(queuedToasts(result({ queued: 2409, alreadyQueued: 3 })).map((t) => t.text), [
    '2,409 titles queued to be processed again',
    '3 titles already in the queue',
  ]);
  assert.deepEqual(queuedToasts(result({})), []);
});

const ruddlow = { itemId: 'm2', title: 'Ruddlow Hill (1991)', reason: 'its original was deleted after packaging' };
const tarsby = { itemId: 'm7', title: 'Tarsby Road (2008)', reason: 'its original was deleted after packaging' };

test('a request for every match refused, as the matches changed: the toolbar offers them again', () => {
  assert.equal(refusedMatching(result({ notQueuedText: 'Nothing was queued: the matching titles changed, from 40 to 42.' })), true);
  assert.equal(refusedMatching(result({ notQueuedText: 'Nothing was queued: the matching titles changed.' })), true);
  assert.equal(refusedMatching(result({ queued: 40, queuedText: '40 titles queued to be processed again' })), false);
  assert.equal(refusedMatching(result({ alreadyQueued: 1, alreadyText: '1 title already in the queue', notQueuedText: null })), false);
  assert.equal(refusedMatching(result({})), false);
});

test('titles the queue didn’t take are a warning banner in katalog-manager’s words, each one and why under details', () => {
  assert.deepEqual(
    notQueuedBanner(result({ queued: 9, skipped: 2, skippedTitles: [ruddlow, tarsby], notQueuedText: '2 titles weren’t queued: their originals were deleted after packaging.' })),
    {
      text: '2 titles weren’t queued: their originals were deleted after packaging.',
      detail: 'Ruddlow Hill (1991): its original was deleted after packaging\nTarsby Road (2008): its original was deleted after packaging',
    },
  );
  // nothing queued at all, for want of a title: the banner says so, with nothing under details
  assert.deepEqual(notQueuedBanner(result({ notQueuedText: 'Nothing was queued: no title was selected.' })), {
    text: 'Nothing was queued: no title was selected.',
    detail: '',
  });
  assert.deepEqual(notQueuedBanner(result({ notQueuedText: 'Nothing was queued: no title fits the filter anymore.' })), {
    text: 'Nothing was queued: no title fits the filter anymore.',
    detail: '',
  });
  assert.equal(notQueuedBanner(result({ queued: 4, queuedText: '4 titles queued to be processed again' })), null);
  assert.equal(notQueuedBanner(result({ notQueuedText: ' ' })), null);
});

test('a server that counts titles skipped without saying it gets a sentence from the count', () => {
  assert.deepEqual(notQueuedBanner(result({ skipped: 1, skippedTitles: [{ ...ruddlow, reason: 'its original was deleted after packaging.' }] })), {
    text: '1 title wasn’t queued: its original was deleted after packaging.',
    detail: 'Ruddlow Hill (1991): its original was deleted after packaging',
  });
  const disc = { itemId: 'e1', title: 'Pellam Bay · S01E02 · Chapter 2', reason: 'its file is a disc image' };
  assert.deepEqual(notQueuedBanner(result({ queued: 9, skipped: 3, skippedTitles: [ruddlow, tarsby, disc] })), {
    text: '3 titles weren’t queued.',
    detail:
      'Ruddlow Hill (1991): its original was deleted after packaging\nTarsby Road (2008): its original was deleted after packaging\nPellam Bay · S01E02 · Chapter 2: its file is a disc image',
  });
  // a count without the titles: katalog-manager's message under details
  assert.deepEqual(notQueuedBanner(result({ skipped: 2, message: '2 titles skipped: they have no file.' })), {
    text: '2 titles weren’t queued.',
    detail: '2 titles skipped: they have no file.',
  });
  assert.equal(notQueuedBanner(result({ queued: 4 })), null);
});

// ---- sizes

test('a header sorts its column the way it goes at first, and pressed again the other way', () => {
  assert.deepEqual(DEFAULT_ORDER, { sort: 'PACKAGE_SIZE', descending: true });
  assert.deepEqual(nextOrder(DEFAULT_ORDER, 'PACKAGE_SIZE'), { sort: 'PACKAGE_SIZE', descending: false });
  assert.deepEqual(nextOrder(DEFAULT_ORDER, 'SAVING'), { sort: 'SAVING', descending: true });
  assert.deepEqual(nextOrder(DEFAULT_ORDER, 'VIDEO_BITRATE'), { sort: 'VIDEO_BITRATE', descending: true });
  // titles from A
  assert.deepEqual(nextOrder(DEFAULT_ORDER, 'TITLE'), { sort: 'TITLE', descending: false });
  assert.deepEqual(nextOrder({ sort: 'TITLE', descending: false }, 'TITLE'), { sort: 'TITLE', descending: true });
  assert.equal(ariaSort(DEFAULT_ORDER, 'PACKAGE_SIZE'), 'descending');
  assert.equal(ariaSort({ sort: 'TITLE', descending: false }, 'TITLE'), 'ascending');
  assert.equal(ariaSort(DEFAULT_ORDER, 'TITLE'), 'none');
});

test('the CSV asks for the filter and the order the table shows, and is named by the kind and the check’s time', () => {
  assert.equal(csvQuery(DEFAULT_FILTER, DEFAULT_ORDER), 'kind=MOVIE&sort=PACKAGE_SIZE&descending=true');
  assert.equal(
    csvQuery({ kind: '', rules: ['NO_SURROUND', 'OVER_SIZE_CAP'], search: ' pine ' }, { sort: 'TITLE', descending: false }),
    'rules=OVER_SIZE_CAP%2CNO_SURROUND&search=pine&sort=TITLE&descending=false',
  );
  // beside the GraphQL endpoint, wherever it is
  assert.equal(csvUrl('/api/manage', DEFAULT_FILTER, DEFAULT_ORDER), '/api/manage/compliance.csv?kind=MOVIE&sort=PACKAGE_SIZE&descending=true');
  assert.equal(csvUrl('https://catalog.example/', DEFAULT_FILTER, DEFAULT_ORDER), 'https://catalog.example/compliance.csv?kind=MOVIE&sort=PACKAGE_SIZE&descending=true');
  // as katalog-manager names it, in UTC, for a response that doesn't
  assert.equal(csvFileName('MOVIE', '2026-10-26T13:43:09Z'), 'rules-movies-2026-10-26T1343Z.csv');
  assert.equal(csvFileName('EPISODE', '2026-10-26T13:43:09Z'), 'rules-episodes-2026-10-26T1343Z.csv');
  assert.equal(csvFileName('', '2026-10-26T13:43:09Z'), 'rules-all-2026-10-26T1343Z.csv');
  // never checked: the time of the download
  assert.equal(csvFileName('MOVIE', null, new Date(Date.UTC(2026, 0, 2, 3, 4))), 'rules-movies-2026-01-02T0304Z.csv');
});

test('the name the server gives a download, as Content-Disposition writes it', () => {
  assert.equal(dispositionName('attachment; filename=rules-movies-2026-10-26T1412Z.csv'), 'rules-movies-2026-10-26T1412Z.csv');
  assert.equal(dispositionName('attachment; filename="rules all.csv"'), 'rules all.csv');
  assert.equal(dispositionName('attachment; filename="a \\"b\\".csv"'), 'a "b".csv');
  assert.equal(dispositionName("attachment; filename*=utf-8''r%C3%A8gles.csv"), 'règles.csv');
  assert.equal(dispositionName("attachment; filename*=utf-8''%E0%A4%A; filename=plain.csv"), 'plain.csv');
  // only a name, never a path
  assert.equal(dispositionName('attachment; filename="../../etc/rules.csv"'), 'rules.csv');
  assert.equal(dispositionName('attachment'), null);
  assert.equal(dispositionName(null), null);
});

test('the check’s line counts the titles it checked and those that break a rule, as far as they are known', () => {
  assert.deepEqual(checkCounts(2409, 279), ['2,409 titles checked', '279 break a rule']);
  assert.deepEqual(checkCounts(1, 1), ['1 title checked', '1 breaks a rule']);
  assert.deepEqual(checkCounts(null, 279), ['279 break a rule']);
  assert.deepEqual(checkCounts(undefined, undefined), []);
});

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

// ---- the report's states

const gqlError = (message: string) => Object.assign(new Error(message), { name: 'GqlError' });

test('an older katalog-manager’s validation errors read as a catalog service without the rules check, its name under details', () => {
  assert.equal(notCheckedHere('Unknown type "ComplianceKind".; Cannot query field "libraryCompliance" on type "Query".'), true);
  assert.equal(notCheckedHere('Unknown type "ComplianceRule".'), true);
  assert.equal(notCheckedHere('Cannot query field "queueReworkMatching" on type "Mutation".'), true);
  assert.equal(notCheckedHere('Cannot query field "matching" on type "ComplianceReport".'), false);
  assert.equal(notCheckedHere(null), false);
  assert.deepEqual(loadFailure(gqlError('Cannot query field "libraryCompliance" on type "Query".')), {
    title: 'couldn’t load the rules',
    reason: 'The catalog service on this server is older than this console and has no rules check.',
    retry: false,
    detail: 'katalog-manager: Cannot query field "libraryCompliance" on type "Query".',
  });
});

test('a list that couldn’t load says why, by the HTTP status, the reason only', () => {
  const why = (e: unknown) => loadFailure(e).reason;
  assert.equal(why(new TypeError('Failed to fetch')), 'Can’t reach the server.');
  assert.equal(why(new Error('katalog-manager 408')), 'Can’t reach the server.');
  assert.equal(why(new Error('katalog-manager 429')), 'The server is busy.');
  assert.equal(why(new Error('katalog-manager 500')), 'The server ran into a problem.');
  assert.equal(why(new Error('katalog-manager 502')), 'The server ran into a problem.');
  // a 404 on a list: the app and the server don't match
  assert.equal(why(new Error('katalog-manager 404')), 'The server didn’t accept the request. Check for an app update.');
  assert.equal(why(new Error('katalog-manager 400')), 'The server didn’t accept the request. Check for an app update.');
  assert.deepEqual(loadFailure(new Error('katalog-manager 403')), { title: 'you don’t have access to this', reason: '', retry: false, detail: 'HTTP 403' });
  assert.equal(loadFailure(new Error('katalog-manager 502')).detail, 'HTTP 502');
  assert.equal(loadFailure(new Error('katalog-manager 502')).title, 'couldn’t load the rules');
  // a query this katalog-manager doesn't take, and a problem it ran into
  assert.equal(why(gqlError('Cannot query field "matching" on type "ComplianceReport".')), 'The server didn’t accept the request.');
  assert.equal(why(gqlError('pq: connection refused')), 'The server ran into a problem.');
  assert.equal(loadFailure(gqlError('pq: connection refused')).detail, 'pq: connection refused');
  assert.equal(why('something else'), 'The server ran into a problem.');
});

test('a refresh that failed says how old the list on the screen is', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  assert.equal(staleText(now - 4 * 60_000, now), 'Couldn’t refresh the list; it shows what was loaded 4m ago.');
  assert.equal(staleText(null, now), 'Couldn’t refresh the list.');
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
    emptyState({ ...checked, notEvaluated: ['The transcoder hasn’t reported its rules.'] }, DEFAULT_FILTER)?.text,
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
    text: 'The titles haven’t been checked against the rules.',
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
