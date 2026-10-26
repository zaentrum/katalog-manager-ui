// Pure helpers for the rules tab: the titles that break the rules the
// pipeline's workers report, and their rework through the re-encode queue.
// No React, no DOM, so `npm test` runs them under node as they are.
import { failedTitle, timeoutText } from './processing.ts';
import { meanwhileText } from './reencode.ts';

// ---- katalog-manager's libraryCompliance, as it answers it

export type ComplianceRule =
  | 'NOT_PACKAGED'
  | 'PACKAGING_FAILED'
  | 'OVER_BITRATE_CAP'
  | 'OVER_SIZE_CAP'
  | 'NO_SURROUND'
  | 'IMAGE_SUBTITLES_MISSING'
  | 'VIDEO_NOT_HEVC';
export type ComplianceKind = 'MOVIE' | 'EPISODE';

/** A setting a worker reported, as it names it. */
export interface RuleSetting {
  key: string;
  label: string;
  value: string;
}
/** What a worker reported of its rules; null for a worker that never did. */
export interface WorkerRules {
  worker: string;
  version: string | null;
  reportedAt: string;
  rules: RuleSetting[];
}
export interface PipelineRules {
  transcoder: WorkerRules | null;
  packager: WorkerRules | null;
}
/** A rule a title breaks: katalog-manager's sentence, and what it measured
 *  against the rule's limit, when it says. */
export interface ComplianceFinding {
  rule: ComplianceRule;
  text: string;
  measured: string | null;
  limit: string | null;
}
export interface ComplianceRow {
  itemId: string;
  title: string;
  year: number | null;
  kind: ComplianceKind;
  seriesId: string | null;
  seriesTitle: string | null;
  season: number | null;
  episode: number | null;
  findings: ComplianceFinding[];
  originalBytes: number | null;
  packageBytes: number | null;
  estimatedBytes: number | null; // the package at most, under the rules
  queue: string | null; // queued | sent | done | failed: where the title stands in the re-encode queue
  evaluatedAt: string;
}
export interface ComplianceSummary {
  rule: ComplianceRule;
  titles: number;
  packageBytes: number;
  estimatedBytes: number | null;
}
export interface ComplianceReport {
  rules: PipelineRules;
  notEvaluated: string[];
  evaluatedAt: string | null; // the oldest evaluation in the report; null when never evaluated
  evaluating: boolean;
  total: number; // the titles that match the filter, over every page
  summary: ComplianceSummary[];
  rows: ComplianceRow[]; // the titles that break a rule, biggest package (then original) first
  nextCursor: string | null;
}
/** What queueRework and queueReworkMatching answer. */
export interface ComplianceQueued {
  queued: number;
  alreadyQueued: number;
  skipped: number;
  message: string;
}

// ---- the rules

/** The rules in the order the tab lists them: the packaging first, then the
 *  transcoder's, then the packager's. */
export const RULE_ORDER: readonly ComplianceRule[] = [
  'NOT_PACKAGED',
  'PACKAGING_FAILED',
  'OVER_BITRATE_CAP',
  'OVER_SIZE_CAP',
  'VIDEO_NOT_HEVC',
  'NO_SURROUND',
  'IMAGE_SUBTITLES_MISSING',
];

const RULE_LABELS: Record<ComplianceRule, string> = {
  NOT_PACKAGED: 'not packaged',
  PACKAGING_FAILED: 'packaging failed',
  OVER_BITRATE_CAP: 'over the bitrate cap',
  OVER_SIZE_CAP: 'over the size cap',
  VIDEO_NOT_HEVC: 'video not HEVC',
  NO_SURROUND: 'no surround track',
  IMAGE_SUBTITLES_MISSING: 'image subtitles missing',
};

/** What a title breaking the rule is, in a few words; a rule the console
 *  does not know reads as its name. */
export function ruleLabel(rule: string): string {
  return RULE_LABELS[rule as ComplianceRule] ?? rule.toLowerCase().replace(/_/g, ' ');
}

/** xs in RULE_ORDER; a rule the console does not know comes after, by name. */
export function inRuleOrder<T extends { rule: string } | string>(xs: readonly T[]): T[] {
  const name = (x: T) => (typeof x === 'string' ? x : x.rule);
  const at = (x: T) => {
    const i = (RULE_ORDER as readonly string[]).indexOf(name(x));
    return i < 0 ? RULE_ORDER.length : i;
  };
  return [...xs].sort((a, b) => at(a) - at(b) || name(a).localeCompare(name(b)));
}

// ---- the filter

export interface ComplianceFilter {
  kind: ComplianceKind | ''; // '' is movies and episodes
  rules: ComplianceRule[]; // none is every rule
  search: string;
}

export const DEFAULT_FILTER: ComplianceFilter = { kind: 'MOVIE', rules: [], search: '' };

/** The choices of the type filter. */
export const KIND_OPTIONS: { label: string; value: ComplianceKind | '' }[] = [
  { label: 'movies', value: 'MOVIE' },
  { label: 'episodes', value: 'EPISODE' },
  { label: 'all', value: '' },
];

/** The filter as libraryCompliance and queueReworkMatching take it. */
export function filterVariables(f: ComplianceFilter): {
  kind: ComplianceKind | null;
  rules: ComplianceRule[] | null;
  search: string | null;
} {
  return {
    kind: f.kind || null,
    rules: f.rules.length ? inRuleOrder(f.rules) : null,
    search: f.search.trim() || null,
  };
}

/** The same for two filters that ask for the same titles: a change of it
 *  clears the selection. */
export function filterKey(f: ComplianceFilter): string {
  return JSON.stringify(filterVariables(f));
}

/** rules with rule ticked (on) or not. */
export function withRule(rules: readonly ComplianceRule[], rule: ComplianceRule, on: boolean): ComplianceRule[] {
  const rest = rules.filter((r) => r !== rule);
  return on ? inRuleOrder([...rest, rule]) : rest;
}

/** True when the list shows the titles of this rule alone. */
export function isOnlyRule(rules: readonly ComplianceRule[], rule: ComplianceRule): boolean {
  return rules.length === 1 && rules[0] === rule;
}

/** The rules after a rule of the summary is picked: that rule alone, or
 *  every rule again when it was the one shown. */
export function pickRule(rules: readonly ComplianceRule[], rule: ComplianceRule): ComplianceRule[] {
  return isOnlyRule(rules, rule) ? [] : [rule];
}

// ---- the rows

/** A row's title as the list names it: a movie with its year, "Vellmar
 *  Station (2019)"; an episode with its series and its place in it,
 *  "Pellam Bay · S01E02 · Chapter 2". */
export function rowTitle(r: Pick<ComplianceRow, 'title' | 'year' | 'kind' | 'seriesTitle' | 'season' | 'episode'>): string {
  if (r.kind === 'EPISODE') {
    return failedTitle({ itemTitle: r.title, seriesTitle: r.seriesTitle, seasonNumber: r.season, episodeNumber: r.episode });
  }
  const title = r.title.trim() || '(untitled)';
  return r.year != null ? `${title} (${r.year})` : title;
}

/** A finding as the row says it: katalog-manager's sentence; without one,
 *  the rule and what was measured against its limit. */
export function findingText(f: ComplianceFinding): string {
  const text = f.text.trim();
  if (text) return text;
  const facts = [f.measured?.trim(), f.limit?.trim() ? `limit ${f.limit.trim()}` : ''].filter((x): x is string => !!x);
  return facts.length ? `${ruleLabel(f.rule)}: ${facts.join(', ')}` : ruleLabel(f.rule);
}

/** rows, then those of more not among them (a page loaded after). */
export function appendRows(rows: readonly ComplianceRow[], more: readonly ComplianceRow[]): ComplianceRow[] {
  const seen = new Set(rows.map((r) => r.itemId));
  return [...rows, ...more.filter((r) => !seen.has(r.itemId))];
}

// ---- the re-encode queue

const QUEUE_WORDS: Record<string, string> = { queued: 'queued', sent: 'encoding', done: 'done', failed: 'failed' };

/** Where a title stands in the re-encode queue, in a word; '' for a title
 *  not in it. */
export function queueWord(queue: string | null | undefined): string {
  return queue ? (QUEUE_WORDS[queue] ?? queue) : '';
}

/** The tone of a title's place in the queue. */
export function queueTone(queue: string | null | undefined): 'neutral' | 'green' | 'amber' | 'blue' {
  switch (queue) {
    case 'queued':
    case 'sent':
      return 'blue';
    case 'done':
      return 'green';
    case 'failed':
      return 'amber';
    default:
      return 'neutral';
  }
}

/** True for a title the queue holds already, waiting or sent: it is not
 *  reworked again. One done or failed is. */
export function inQueue(queue: string | null | undefined): boolean {
  return queue === 'queued' || queue === 'sent';
}

// ---- the selection

/** The titles ticked: rows of the list by id, or every title that matches
 *  the filter, the rows not loaded too. */
export type Selection = { mode: 'rows'; ids: readonly string[] } | { mode: 'matching' };

export const NO_SELECTION: Selection = { mode: 'rows', ids: [] };

/** What changes the selection. `loaded` is the ids of the rows the list
 *  shows that can be ticked (none the queue holds already). */
export type SelectionAction =
  | { type: 'row'; id: string; on: boolean; loaded: readonly string[] }
  | { type: 'page'; on: boolean; loaded: readonly string[] }
  | { type: 'matching' }
  | { type: 'clear' }
  | { type: 'keep'; loaded: readonly string[] };

/** The selection after a: a row ticked or not; every row shown (the header
 *  checkbox); every title that matches; none (cleared, as a change of the
 *  filter clears it); the rows still listed after a refresh. A row unticked
 *  while every match is ticked leaves the other rows shown ticked. */
export function select(s: Selection, a: SelectionAction): Selection {
  switch (a.type) {
    case 'row': {
      if (s.mode === 'matching') {
        return a.on ? s : { mode: 'rows', ids: a.loaded.filter((id) => id !== a.id) };
      }
      const rest = s.ids.filter((id) => id !== a.id);
      return { mode: 'rows', ids: a.on && a.loaded.includes(a.id) ? [...rest, a.id] : rest };
    }
    case 'page':
      return a.on ? { mode: 'rows', ids: [...a.loaded] } : NO_SELECTION;
    case 'matching':
      return { mode: 'matching' };
    case 'clear':
      return NO_SELECTION;
    case 'keep': {
      if (s.mode === 'matching') return s;
      const ids = s.ids.filter((id) => a.loaded.includes(id));
      return ids.length === s.ids.length ? s : { mode: 'rows', ids };
    }
  }
}

export function isSelected(s: Selection, id: string): boolean {
  return s.mode === 'matching' || s.ids.includes(id);
}

/** How many titles are ticked: every match counts the filter's total. */
export function selectedCount(s: Selection, total: number): number {
  return s.mode === 'matching' ? total : s.ids.length;
}

/** The header checkbox: none of the rows shown ticked, some, or all. */
export function pageState(s: Selection, loaded: readonly string[]): 'none' | 'some' | 'all' {
  if (s.mode === 'matching') return 'all';
  if (loaded.length === 0) return 'none';
  const n = loaded.filter((id) => s.ids.includes(id)).length;
  return n === 0 ? 'none' : n === loaded.length ? 'all' : 'some';
}

/** True when every row shown is ticked and more titles match than are
 *  shown: then "select all N matching" is offered. */
export function offersMatching(s: Selection, loaded: readonly string[], shown: number, total: number): boolean {
  return s.mode === 'rows' && loaded.length > 0 && pageState(s, loaded) === 'all' && total > shown;
}

/** What the selection's bar says is ticked. */
export function selectionText(s: Selection, total: number): string {
  return s.mode === 'matching' ? `all ${total} matching selected` : `${s.ids.length} selected`;
}

// ---- sizes

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** A size in bytes as the consoles write sizes: in steps of 1024, as the item
 *  page's mb, to one decimal below 10 and whole from there: "870 MB",
 *  "4.2 GB", "59 GB", "1.4 TB"; '—' for none. */
export function fmtBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
  let v = n;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  // 1023.7 MB rounds to the next unit
  if (Math.round(v) >= 1024 && i < UNITS.length - 1) return `1 ${UNITS[i + 1]}`;
  const text = i > 0 && v < 9.95 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v));
  return `${text} ${UNITS[i]}`;
}

/** A size of the list: '—' for none or nothing. */
export function sizeText(n: number | null | undefined): string {
  return n != null && n > 0 ? fmtBytes(n) : '—';
}

/** A package's size now and at most after the rework, as the rows and the
 *  summary write it: "59 GB → at most 12 GB"; "59 GB" without an estimate;
 *  "— → at most 12 GB" without a package. */
export function sizeChange(now: number | null | undefined, after: number | null | undefined): string {
  return after != null && after > 0 ? `${sizeText(now)} → at most ${fmtBytes(after)}` : sizeText(now);
}

// ---- the rework and its confirm

/** What a rework asks for, as its confirm says it. Sizes are null where they
 *  are not known: every title that matches, of which only a page is loaded. */
export interface ReworkScope {
  matching: boolean; // every title that matches the filter, not rows named
  titles: number;
  name: string | null; // the title's, when it is one
  packageBytes: number | null; // the packages now
  estimatedBytes: number | null; // at most after the rework
  estimated: number | null; // how many have an estimate; null when not known
  sized: number | null; // how many titles the sizes are of; null when all
  withoutPackage: boolean | null; // a title has no package; null when it may
}

/** The sizes of titles, as a rework's confirm says them: their packages
 *  now, at most after (of those with an estimate), and whether one has no
 *  package. */
export function sizesOf(
  rows: readonly Pick<ComplianceRow, 'packageBytes' | 'estimatedBytes'>[],
): Pick<ReworkScope, 'packageBytes' | 'estimatedBytes' | 'estimated' | 'sized' | 'withoutPackage'> {
  const estimated = rows.filter((r) => r.estimatedBytes != null && r.estimatedBytes > 0);
  return {
    packageBytes: rows.reduce((sum, r) => sum + (r.packageBytes ?? 0), 0),
    estimatedBytes: estimated.length ? estimated.reduce((sum, r) => sum + (r.estimatedBytes ?? 0), 0) : null,
    estimated: estimated.length,
    sized: rows.length,
    withoutPackage: rows.some((r) => r.packageBytes == null || r.packageBytes <= 0),
  };
}

/** The scope of a rework of these rows. */
export function rowsScope(rows: readonly ComplianceRow[]): ReworkScope {
  return {
    matching: false,
    titles: rows.length,
    name: rows.length === 1 ? rowTitle(rows[0]) : null,
    ...sizesOf(rows),
  };
}

/** The scope of a rework of every title that matches the filter. Its sizes
 *  are known when every match is loaded, or when one rule is picked and its
 *  line of the summary counts the same titles; otherwise the confirm counts
 *  them (sizesOf every page). */
export function matchingScope(
  report: Pick<ComplianceReport, 'total' | 'summary' | 'nextCursor'>,
  filter: ComplianceFilter,
  rows: readonly ComplianceRow[],
): ReworkScope {
  if (!report.nextCursor && rows.length === report.total) return { ...rowsScope(rows), matching: true };
  const packaging = filter.rules.length === 0 || filter.rules.some((r) => r === 'NOT_PACKAGED' || r === 'PACKAGING_FAILED');
  const scope: ReworkScope = {
    matching: true,
    titles: report.total,
    name: null,
    packageBytes: null,
    estimatedBytes: null,
    estimated: null,
    sized: null,
    withoutPackage: packaging ? null : false,
  };
  const line = filter.rules.length === 1 ? report.summary.find((s) => s.rule === filter.rules[0]) : undefined;
  if (line && line.titles === report.total) {
    return { ...scope, packageBytes: line.packageBytes, estimatedBytes: line.estimatedBytes };
  }
  return scope;
}

/** The re-encode queue's pace and what it holds, as far as katalog-manager
 *  says: its settings that are set (a number a pass, at once, a window),
 *  how often its sweep runs, the titles in it and why it sends none now.
 *  Each is null when not known. */
export interface QueueFacts {
  rate: number | null;
  inflight: number | null;
  window: string | null; // "23:00-07:00"
  intervalSeconds: number | null;
  queued: number | null;
  sent: number | null;
  idle: string | null;
}

// The settings katalog-manager reads the queue's pace from.
const RATE = 'library.reencode.rate';
const INFLIGHT = 'library.reencode.inflight';
const WINDOW = 'library.reencode.window';
const WINDOW_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

/** The queue's facts from katalog-manager's settings, its sweep's interval
 *  and the queue's counts. A setting that is not set, or holds what
 *  katalog-manager does not read as one (it then uses its own value), is not
 *  known: the console never says a value katalog-manager did not give it. */
export function queueFacts(
  settings: readonly { key: string; valueText: string | null }[] | null | undefined,
  intervalSeconds: number | null | undefined,
  queue: { queued: number; sent: number; idle: string | null } | null | undefined,
): QueueFacts {
  const value = (key: string) => settings?.find((s) => s.key.trim() === key)?.valueText?.trim() ?? '';
  // a rate of 0 sends none: the queue says so itself (idle)
  const count = (v: string) => (/^\d+$/.test(v) && Number(v) >= 1 ? Number(v) : null);
  const window = value(WINDOW).replace(/\s+/g, '');
  return {
    rate: count(value(RATE)),
    inflight: count(value(INFLIGHT)),
    window: WINDOW_RE.test(window) ? window : null,
    intervalSeconds: intervalSeconds && intervalSeconds > 0 ? intervalSeconds : null,
    queued: queue ? queue.queued : null,
    sent: queue ? queue.sent : null,
    idle: queue?.idle?.trim() || null,
  };
}

/** The queue's pace in words, from what is known of it: "up to 2 titles
 *  every 30s, no more than 2 at once, between 23:00 and 07:00 server time";
 *  '' when nothing is. */
export function paceText(q: QueueFacts | null): string {
  if (!q) return '';
  const parts: string[] = [];
  if (q.rate && q.intervalSeconds) {
    parts.push(`up to ${q.rate} ${q.rate === 1 ? 'title' : 'titles'} every ${timeoutText(q.intervalSeconds)}`);
  }
  if (q.inflight) parts.push(`no more than ${q.inflight} at once`);
  const [from, to] = q.window ? q.window.split('-') : [];
  // a window that starts where it ends is the whole day
  if (from && to && from !== to) parts.push(`between ${from} and ${to} server time`);
  return parts.join(', ');
}

function sentence(s: string): string {
  return s.replace(/[.\s]+$/, '') + '.';
}

/** Why the queue sends none now, as the confirm says it: outside its
 *  window in words, when that is the reason and the pace names the window;
 *  else katalog-manager's reason as it gives it. '' when it sends. */
export function idleText(q: QueueFacts | null): string {
  if (!q?.idle) return '';
  if (q.window && q.idle.startsWith('outside ') && q.idle.includes(WINDOW)) {
    return 'the queue sends none right now: that is outside those hours.';
  }
  return sentence(`the queue sends none right now: ${q.idle}`);
}

/** What the confirm says of the sizes; '' when they are not known. */
function sizesText(s: ReworkScope): string {
  if (s.packageBytes == null) return '';
  const after = s.estimatedBytes != null && s.estimatedBytes > 0 ? fmtBytes(s.estimatedBytes) : null;
  const one = s.titles === 1;
  if (s.packageBytes <= 0) {
    if (!after) return '';
    return one
      ? `it has no package now, and takes at most ${after} after the rework.`
      : `they have no package now, and take at most ${after} after the rework.`;
  }
  const now = fmtBytes(s.packageBytes);
  if (one) return after ? `its package takes ${now} now, at most ${after} after the rework.` : `its package takes ${now} now.`;
  if (!after) return `their packages take ${now} now.`;
  if (s.estimated != null && s.estimated < (s.sized ?? s.titles)) {
    return `their packages take ${now} now; the ${s.estimated} of them with an estimate take at most ${after} after the rework.`;
  }
  return `their packages take ${now} now, at most ${after} after the rework.`;
}

/** The confirm's title: how many titles. */
export function reworkTitle(s: Pick<ReworkScope, 'titles'>): string {
  return s.titles === 1 ? 'rework 1 title' : `rework ${s.titles} titles`;
}

/** The confirm's button. */
export function reworkButton(s: Pick<ReworkScope, 'titles'>): string {
  return s.titles === 1 ? 'rework' : `rework ${s.titles}`;
}

/** What the confirm says a rework does, a paragraph each: what it encodes
 *  and with what, the sizes now and after, the queue that sends the titles
 *  at its pace, what plays meanwhile, and a title busy when its turn comes.
 *  The same dialog for one title and many. */
export function reworkText(s: ReworkScope, q: QueueFacts | null): string[] {
  const one = s.titles === 1;
  const settings = 'this instance’s current pipeline settings, the transcoder’s and then the packager’s';
  const what = one
    ? `encodes ${s.name ? `“${s.name}”` : 'the title'} again with ${settings}.`
    : s.matching
      ? `encodes all ${s.titles} matching titles again with ${settings}.`
      : `encodes these ${s.titles} titles again with ${settings}.`;

  const pace = paceText(q);
  const queue = one
    ? `it goes through the re-encode queue, which sends it on at its own pace${pace ? `: ${pace}` : ''}.`
    : `they go through the re-encode queue, which sends them on at its own pace${pace ? `: ${pace}` : ''}.`;
  const holds = [q?.queued ? `${q.queued} queued` : '', q?.sent ? `${q.sent} encoding` : ''].filter(Boolean);
  const now = [holds.length ? `in the queue now: ${holds.join(', ')}.` : '', idleText(q)].filter(Boolean).join(' ');

  const noPackage = 'a title without a package plays by on-demand transcoding until its package is complete.';
  const meanwhile = one
    ? s.withoutPackage
      ? 'it plays by on-demand transcoding until its package is complete.'
      : meanwhileText()
    : s.withoutPackage === false
      ? meanwhileText('title')
      : `${meanwhileText('title')} ${noPackage}`;
  const busy = one
    ? 'while a transcode or package of it is running, it stays queued.'
    : 'a title whose transcode or package is running stays queued, and the next one goes.';

  return [what, sizesText(s), queue, now, meanwhile, busy].filter(Boolean);
}

/** The counts of a queueing, as the tab says them after it. */
export function queuedCounts(r: ComplianceQueued): string {
  return `${r.queued} queued · ${r.alreadyQueued} queued already · ${r.skipped} skipped`;
}

/** True when the queue took the titles, or held them already: the confirm
 *  closes. One that took none (each skipped) stays open, saying why. */
export function queuedAny(r: ComplianceQueued): boolean {
  return r.queued + r.alreadyQueued > 0;
}

// ---- the report's states

/** True when katalog-manager does not know the report: an older one answers
 *  that the query (or its types) is no field (graph-gophers' validation
 *  errors), which is no failure but a catalog that does not check its rules. */
export function notCheckedHere(error: string | null | undefined): boolean {
  if (!error) return false;
  return (
    /Cannot query field "(libraryCompliance|pipelineRules|queueRework|queueReworkMatching|refreshCompliance)" on type "(Query|Mutation)"/.test(error) ||
    /Unknown type "Compliance(Kind|Rule)"/.test(error)
  );
}

/** Where the report's check stands: a check running, checked (evaluatedAt
 *  says when), or never checked. */
export function checkState(r: Pick<ComplianceReport, 'evaluating' | 'evaluatedAt'>): 'checking' | 'checked' | 'never' {
  return r.evaluating ? 'checking' : r.evaluatedAt ? 'checked' : 'never';
}

/** What the tab says when no title is listed: none matching the filter, or
 *  every title following the rules (those checked, when some are not); ''
 *  while the titles were never checked, which the rules panel says. */
export function emptyText(r: Pick<ComplianceReport, 'evaluatedAt' | 'notEvaluated'>, f: ComplianceFilter): string {
  if (!r.evaluatedAt) return '';
  const noun = f.kind === 'MOVIE' ? 'movie' : f.kind === 'EPISODE' ? 'episode' : 'title';
  const search = f.search.trim();
  if (search || f.rules.length) {
    const who = search ? `${noun} matching “${search}”` : noun;
    return `no ${who} breaks ${f.rules.length ? 'the rules picked' : 'the rules'}.`;
  }
  return r.notEvaluated.length ? `every ${noun} follows the rules that were checked.` : `every ${noun} follows the rules.`;
}

/** How often the tab reads the report again by itself, in ms: often while a
 *  check runs, slowly while a title listed is in the queue, else never (0). */
export function pollMs(r: Pick<ComplianceReport, 'evaluating'> | null, rows: readonly Pick<ComplianceRow, 'queue'>[]): number {
  if (!r) return 0;
  if (r.evaluating) return 5_000;
  return rows.some((x) => inQueue(x.queue)) ? 30_000 : 0;
}

/** A worker's name as the rules panel heads it: the pipeline's word for it,
 *  with the name it reported when that is another. */
export function workerName(slot: string, w: Pick<WorkerRules, 'worker'>): string {
  const name = w.worker.trim();
  return name && name !== slot ? `${slot} (${name})` : slot;
}
