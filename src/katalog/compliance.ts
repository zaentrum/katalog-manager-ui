// Pure helpers for the rules tab: the titles that break the rules the
// transcoder and the packager report, and processing them again through the
// re-encode queue. No React, no DOM, so `npm test` runs them under node as
// they are.
import { ago, failedTitle } from './processing.ts';

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

/** A setting a worker reported, as it names it: its value in words, and the
 *  raw config when the words aren't it ("source:hevc"). */
export interface RuleSetting {
  key: string;
  label: string;
  value: string;
  detail: string | null;
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
/** A rule a title breaks: katalog-manager's sentence, what it measured
 *  against the rule's limit, when it says, and the technical part (a tool's
 *  output, a codec's id). */
export interface ComplianceFinding {
  rule: ComplianceRule;
  text: string;
  measured: string | null;
  limit: string | null;
  detail: string | null;
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
  queueReason: string | null; // why it waits or failed there, in a sentence
  queueDetail: string | null; // the technical part of that ("ffmpeg exited 1")
  reworkBlocked: string | null; // why processing it again can't help, a clause ("its file is a disc image"); null when it can
  evaluatedAt: string;
}
export interface ComplianceSummary {
  rule: ComplianceRule;
  titles: number;
  packageBytes: number;
  estimatedBytes: number | null;
}
/** The totals over every title that matches the filter, not only a page. */
export interface ComplianceTotals {
  titles: number;
  originalBytes: number;
  packageBytes: number;
  estimatedBytes: number | null;
}
/** The re-encode queue's titles by state, all of them. */
export interface ComplianceQueueCounts {
  queued: number;
  processing: number;
  processed: number;
  failed: number;
}
export interface ComplianceReport {
  rules: PipelineRules;
  notEvaluated: string[];
  evaluatedAt: string | null; // the oldest evaluation in the report; null when never evaluated
  evaluating: boolean;
  matching: ComplianceTotals;
  queueable: ComplianceTotals; // of those matching, the titles the queue would take: none it holds, none processing again can't help
  queue: ComplianceQueueCounts;
  summary: ComplianceSummary[];
  rows: ComplianceRow[]; // the titles that break a rule, biggest package (then original) first
  nextCursor: string | null;
}
/** A title the queue didn't take, and why. */
export interface ComplianceSkip {
  itemId: string;
  title: string;
  reason: string;
}
/** What queueRework and queueReworkMatching answer: the counts, and each
 *  in katalog-manager's words, null where there is nothing to say. */
export interface ComplianceQueued {
  queued: number;
  alreadyQueued: number;
  skipped: number;
  skippedTitles: ComplianceSkip[];
  message: string;
  queuedText: string | null; // "12 titles queued to be processed again"
  alreadyText: string | null; // "3 titles already in the queue"
  notQueuedText: string | null; // "2 titles weren’t queued: …", "Nothing was queued: …"
}

// ---- words and numbers

/** A count with thousands separators: "2,500". */
export function fmtCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** s with its first letter in capitals: the body face's sentence case. */
export function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The titles of a kind, counted: "1 movie", "230 movies", "12 titles". */
export function titlesOf(kind: ComplianceKind | '', n: number): string {
  const [one, many] = kind === 'MOVIE' ? ['movie', 'movies'] : kind === 'EPISODE' ? ['episode', 'episodes'] : ['title', 'titles'];
  return `${fmtCount(n)} ${n === 1 ? one : many}`;
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
  OVER_BITRATE_CAP: 'over the bit rate cap',
  OVER_SIZE_CAP: 'over the size cap',
  VIDEO_NOT_HEVC: 'video not HEVC',
  NO_SURROUND: 'no surround track',
  IMAGE_SUBTITLES_MISSING: 'image subtitles missing',
};

/** What a title breaking the rule is, in a few words, in the monospace
 *  voice; a rule the console does not know reads as its name. */
export function ruleLabel(rule: string): string {
  return RULE_LABELS[rule as ComplianceRule] ?? rule.toLowerCase().replace(/_/g, ' ');
}

/** A rule as the rule filter offers it, in the body face: "Over the bit rate
 *  cap". */
export function ruleOption(rule: string): string {
  return sentenceCase(ruleLabel(rule));
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
/** The filter once "clear all" has cleared it: every kind, rule and title. */
export const CLEARED_FILTER: ComplianceFilter = { kind: '', rules: [], search: '' };

/** The choices of the kind filter, the one that filters nothing first. */
export const KIND_OPTIONS: { label: string; value: ComplianceKind | '' }[] = [
  { label: 'all', value: '' },
  { label: 'movies', value: 'MOVIE' },
  { label: 'episodes', value: 'EPISODE' },
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

/** The same for two filters that ask for the same titles. */
export function filterKey(f: ComplianceFilter): string {
  return JSON.stringify(filterVariables(f));
}

/** True while anything filters: a kind, a rule or a search. "clear all"
 *  works then. */
export function isFiltering(f: ComplianceFilter): boolean {
  return filterKey(f) !== filterKey(CLEARED_FILTER);
}

/** The filter bar's count: what is left of every title that breaks a rule,
 *  "230 of 279"; the total alone while nothing filters, or when it isn't
 *  known; nothing while no title breaks a rule at all. */
export function countText(left: number, all: number | null | undefined): string {
  if (left === 0 && !all) return '';
  return all == null || all === left ? fmtCount(left) : `${fmtCount(left)} of ${fmtCount(all)}`;
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
  return sentenceCase(facts.length ? `${ruleLabel(f.rule)}: ${facts.join(', ')}` : ruleLabel(f.rule));
}

const CAP_RULES: readonly string[] = ['OVER_BITRATE_CAP', 'OVER_SIZE_CAP', 'VIDEO_NOT_HEVC'];

/** What processing a title again does to it, from the rules it breaks, next
 *  to its findings: packaged for the first time; re-encoded, over a cap of
 *  the transcoder's; packaged again otherwise, its video copied where the
 *  transcoder's caps were checked and it is within them (capsChecked); ''
 *  for rules the console does not know. A title whose packaging failed is
 *  packaged again when it has a package, else for the first time. */
export function outcomeText(r: Pick<ComplianceRow, 'findings' | 'packageBytes'>, capsChecked: boolean): string {
  const rules = new Set<string>(r.findings.map((f) => f.rule));
  const packaged = r.packageBytes != null && r.packageBytes > 0;
  const again = capsChecked ? 'Packaged again; the video is copied' : 'Packaged again';
  if (rules.has('NOT_PACKAGED')) return 'Packaged for the first time';
  if (CAP_RULES.some((c) => rules.has(c))) return 'Re-encoded, then packaged again';
  if (rules.has('PACKAGING_FAILED')) return packaged ? again : 'Packaged for the first time';
  if (rules.has('NO_SURROUND') || rules.has('IMAGE_SUBTITLES_MISSING')) return again;
  return '';
}

/** The outcome line under a row's findings: what processing it again does,
 *  with its package at most after when there is an estimate: "Re-encoded,
 *  then packaged again, at most 11.8 GB". A title processing again can't
 *  help is promised nothing: why, as katalog-manager says it, "Can’t be
 *  processed again: its file is a disc image.", and no estimate. */
export function outcomeLine(
  r: Pick<ComplianceRow, 'findings' | 'packageBytes' | 'estimatedBytes' | 'reworkBlocked'>,
  capsChecked: boolean,
): string {
  const blocked = blockedReason(r);
  if (blocked) return `Can’t be processed again: ${blocked}.`;
  const outcome = outcomeText(r, capsChecked);
  const after = r.estimatedBytes != null && r.estimatedBytes > 0 ? `at most ${fmtBytes(r.estimatedBytes)}` : '';
  if (!after) return outcome;
  return outcome ? `${outcome}, ${after}` : sentenceCase(after);
}

/** rows, then those of more not among them (a page loaded after). */
export function appendRows(rows: readonly ComplianceRow[], more: readonly ComplianceRow[]): ComplianceRow[] {
  const seen = new Set(rows.map((r) => r.itemId));
  return [...rows, ...more.filter((r) => !seen.has(r.itemId))];
}

// ---- the re-encode queue

/** True for a title the queue holds, waiting or under way: it can't be
 *  ticked or processed again. One done or failed can. */
export function inQueue(queue: string | null | undefined): boolean {
  return queue === 'queued' || queue === 'sent';
}

/** Why processing a title again can't help, as katalog-manager says it, a
 *  clause ("its file is a disc image"); null when it can. */
export function blockedReason(r: Pick<ComplianceRow, 'reworkBlocked'>): string | null {
  return r.reworkBlocked?.trim().replace(/\.$/, '') || null;
}

/** True for a title that can be ticked and processed again: the queue
 *  doesn't hold it, and processing it again can help. */
export function canProcess(r: Pick<ComplianceRow, 'queue' | 'reworkBlocked'>): boolean {
  return !inQueue(r.queue) && !blockedReason(r);
}

/** The names of a row's checkbox and of its button: what each does, and,
 *  for a title processing again can't help, why they are off. */
export function rowControlNames(
  r: Pick<ComplianceRow, 'title' | 'year' | 'kind' | 'seriesTitle' | 'season' | 'episode' | 'reworkBlocked'>,
): { select: string; process: string } {
  const title = rowTitle(r);
  const blocked = blockedReason(r);
  const why = blocked ? `. Can’t be processed again: ${blocked}.` : '';
  return { select: `select ${title}${why}`, process: `process again: ${title}${why}` };
}

/** A row's status, in the status vocabulary's words: queued, processing,
 *  or needs attention when its processing failed; none otherwise. Its
 *  detail is the queue's reason as katalog-manager says it, what the title
 *  waits for or why it failed ("It is waiting for the transcoder.", "The
 *  transcoder failed."). A title processed and within the rules leaves the
 *  list, so there is no lasting "done". */
export function rowStatus(
  queue: string | null | undefined,
  reason?: string | null,
): { word: string; tone: 'blue' | 'amber'; detail: string | null } | null {
  const why = reason?.trim() || null;
  switch (queue) {
    case 'queued':
      return { word: 'queued', tone: 'blue', detail: why };
    case 'sent':
      return { word: 'processing', tone: 'blue', detail: why };
    case 'failed':
      return { word: 'needs attention', tone: 'amber', detail: why ?? 'Processing failed.' };
    default:
      return null;
  }
}

/** A row's technical part, for under its details and never in its lines:
 *  each finding's (a tool's output, a codec's id) by its rule, then the
 *  queue's, by the status it explains. None when there is none. */
export function rowDetails(r: Pick<ComplianceRow, 'findings' | 'queue' | 'queueDetail'>): string[] {
  const lines = r.findings.flatMap((f) => (f.detail?.trim() ? [`${ruleLabel(f.rule)}: ${f.detail.trim()}`] : []));
  const queued = r.queueDetail?.trim();
  if (queued && rowStatus(r.queue)) lines.push(`status: ${queued}`);
  return lines;
}

/** The queue in numbers and words, the counts there are: "6 queued · 2
 *  processing · 1 needs attention · 34 processed again". */
export function queueParts(q: ComplianceQueueCounts): { count: string; word: string; tone: 'blue' | 'amber' | null }[] {
  const parts: { count: string; word: string; tone: 'blue' | 'amber' | null }[] = [];
  if (q.queued) parts.push({ count: fmtCount(q.queued), word: 'queued', tone: 'blue' });
  if (q.processing) parts.push({ count: fmtCount(q.processing), word: 'processing', tone: 'blue' });
  if (q.failed) parts.push({ count: fmtCount(q.failed), word: 'needs attention', tone: 'amber' });
  if (q.processed) parts.push({ count: fmtCount(q.processed), word: 'processed again', tone: null });
  return parts;
}

// ---- the selection

/** The titles ticked: rows, kept as they were when ticked (a filter may hide
 *  them since), or every title that matches the filter whose key it holds,
 *  the rows not loaded too. */
export type Selection = { mode: 'rows'; rows: readonly ComplianceRow[] } | { mode: 'matching'; key: string };

export const NO_SELECTION: Selection = { mode: 'rows', rows: [] };

/** What changes the selection. `loaded` and `rows` are the rows the list
 *  shows. */
export type SelectionAction =
  | { type: 'row'; row: ComplianceRow; on: boolean; loaded: readonly ComplianceRow[] }
  | { type: 'page'; on: boolean; rows: readonly ComplianceRow[] }
  | { type: 'matching'; key: string }
  | { type: 'clear' }
  | { type: 'filter'; key: string }
  | { type: 'loaded'; rows: readonly ComplianceRow[] };

// a row that can be ticked: one the queue doesn't hold, that processing
// again can help
const pickable = canProcess;

/** The selection after a:
 *  - a row ticked or not (one the queue holds, or that processing again
 *    can't help, can't be);
 *  - the header checkbox: every row shown that can be ticked, or, pressed
 *    while it shows a tick, none;
 *  - every title that matches the filter;
 *  - none (clear, and a finished action);
 *  - a change of the filter: ticked rows stay ticked, hidden or not, and
 *    every match of another filter is no selection any more;
 *  - rows read again: a ticked row is kept as it is now, and drops out once
 *    the queue holds it or processing it again can't help.
 *  A row unticked while every match is ticked leaves the other rows shown. */
export function select(s: Selection, a: SelectionAction): Selection {
  switch (a.type) {
    case 'row': {
      if (!pickable(a.row)) return s;
      if (s.mode === 'matching') {
        return a.on ? s : { mode: 'rows', rows: a.loaded.filter((r) => pickable(r) && r.itemId !== a.row.itemId) };
      }
      const rest = s.rows.filter((r) => r.itemId !== a.row.itemId);
      return { mode: 'rows', rows: a.on ? [...rest, a.row] : rest };
    }
    case 'page': {
      if (!a.on) return NO_SELECTION;
      const kept = s.mode === 'rows' ? s.rows : [];
      const ids = new Set(kept.map((r) => r.itemId));
      return { mode: 'rows', rows: [...kept, ...a.rows.filter((r) => pickable(r) && !ids.has(r.itemId))] };
    }
    case 'matching':
      return { mode: 'matching', key: a.key };
    case 'clear':
      return NO_SELECTION;
    case 'filter':
      return s.mode === 'matching' && s.key !== a.key ? NO_SELECTION : s;
    case 'loaded': {
      if (s.mode === 'matching') return s;
      const now = new Map(a.rows.map((r) => [r.itemId, r]));
      let changed = false;
      const rows = s.rows.flatMap((r) => {
        const n = now.get(r.itemId);
        if (!n || n === r) return [r];
        changed = true;
        return pickable(n) ? [n] : [];
      });
      return changed ? { mode: 'rows', rows } : s;
    }
  }
}

export function isSelected(s: Selection, row: ComplianceRow): boolean {
  if (!pickable(row)) return false;
  return s.mode === 'matching' || s.rows.some((r) => r.itemId === row.itemId);
}

/** How many titles are ticked: every match counts all that match and that
 *  the queue would take (queueable: none it holds already, none processing
 *  again can't help). */
export function selectedCount(s: Selection, queueable: number): number {
  return s.mode === 'matching' ? queueable : s.rows.length;
}

/** The ticked rows the list doesn't show: a filter hides them. */
export function hiddenCount(s: Selection, loaded: readonly ComplianceRow[]): number {
  if (s.mode === 'matching') return 0;
  const shown = new Set(loaded.map((r) => r.itemId));
  return s.rows.filter((r) => !shown.has(r.itemId)).length;
}

/** The header checkbox: none of the rows shown that can be ticked are
 *  ticked, some, or all. */
export function pageState(s: Selection, loaded: readonly ComplianceRow[]): 'none' | 'some' | 'all' {
  const can = loaded.filter(pickable);
  if (can.length === 0) return 'none';
  if (s.mode === 'matching') return 'all';
  const n = can.filter((r) => s.rows.some((p) => p.itemId === r.itemId)).length;
  return n === 0 ? 'none' : n === can.length ? 'all' : 'some';
}

/** True right after the header checkbox has ticked every row shown that
 *  can be ticked, while more titles could be queued than that: then
 *  "select all N matching" is offered, N the titles the queue would take
 *  (queueable). */
export function offersMatching(s: Selection, loaded: readonly ComplianceRow[], queueable: number): boolean {
  return s.mode === 'rows' && pageState(s, loaded) === 'all' && queueable > loaded.filter(pickable).length;
}

/** The selection toolbar's count: "12 selected", "8 selected · 3 hidden by
 *  filters". */
export function selectionText(count: number, hidden: number): string {
  return hidden ? `${fmtCount(count)} selected · ${fmtCount(hidden)} hidden by filters` : `${fmtCount(count)} selected`;
}

/** What the toolbar reads out after a change of the count. */
export function announceText(count: number): string {
  return count ? `${fmtCount(count)} selected` : 'selection cleared';
}

// ---- processing titles again

/** The bulk button, the confirm's title and its button: a verb, the object
 *  and the count. */
export function processLabel(titles: number): string {
  return titles === 1 ? 'process 1 title again' : `process ${fmtCount(titles)} titles again`;
}

/** What the confirm says processing titles again does: of one title, and of
 *  several. */
export function confirmBody(titles: number): string {
  return titles === 1
    ? 'The title is processed again from its original, with today’s settings. Its current version keeps playing until the new one is ready, and the original isn’t changed.'
    : 'Each title is processed again from its original, with today’s settings, one after another. Its current version keeps playing until the new one is ready, and the original isn’t changed.';
}

/** What a confirm asks about: how many titles, the one's name, and their
 *  packages' size now and at most after, where known. */
export interface ProcessScope {
  titles: number;
  name: string | null;
  packageBytes: number | null;
  estimatedBytes: number | null;
}

/** The scope of processing these rows again. */
export function rowsScope(rows: readonly ComplianceRow[]): ProcessScope {
  const estimated = rows.filter((r) => r.estimatedBytes != null && r.estimatedBytes > 0);
  return {
    titles: rows.length,
    name: rows.length === 1 ? rowTitle(rows[0]) : null,
    packageBytes: rows.reduce((sum, r) => sum + (r.packageBytes ?? 0), 0),
    estimatedBytes: estimated.length ? estimated.reduce((sum, r) => sum + (r.estimatedBytes ?? 0), 0) : null,
  };
}

/** The scope of processing every title that matches again, from the report's
 *  totals over all of them that the queue doesn't hold (queueable). */
export function matchingScope(m: ComplianceTotals): ProcessScope {
  return { titles: m.titles, name: null, packageBytes: m.packageBytes, estimatedBytes: m.estimatedBytes };
}

/** A package's size now and at most after, in words: "5.9 TB now, at most
 *  1.3 TB after", "59 GB now", "at most 12 GB after"; '' with neither. */
export function nowAndAfter(now: number | null | undefined, after: number | null | undefined): string {
  return [now != null && now > 0 ? `${fmtBytes(now)} now` : '', after != null && after > 0 ? `at most ${fmtBytes(after)} after` : '']
    .filter(Boolean)
    .join(', ');
}

/** The confirm's facts under its sentence: the title, when it is one, and
 *  the packages now and at most after. */
export function confirmFacts(s: ProcessScope): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  if (s.name) facts.push({ label: 'title', value: s.name });
  const sizes = nowAndAfter(s.packageBytes, s.estimatedBytes);
  if (sizes) facts.push({ label: s.titles === 1 ? 'package' : 'packages', value: sizes });
  return facts;
}

/** A text of katalog-manager's, or null for none. */
function said(text: string | null | undefined): string | null {
  return text?.trim() || null;
}

const titleCount = (n: number) => `${fmtCount(n)} ${n === 1 ? 'title' : 'titles'}`;

/** The toasts after titles were queued, in katalog-manager's words: how many
 *  were queued to be processed again, then, in a plain one, how many the
 *  queue held already; none for a count it says nothing of. A server that
 *  counts titles without saying them gets the same words from the counts.
 *  Titles it didn't take are a banner (notQueuedBanner). */
export function queuedToasts(r: ComplianceQueued): { state: 'success' | 'neutral'; text: string }[] {
  const toasts: { state: 'success' | 'neutral'; text: string }[] = [];
  const queued = said(r.queuedText) ?? (r.queued > 0 ? `${titleCount(r.queued)} queued to be processed again` : null);
  if (queued) toasts.push({ state: 'success', text: queued });
  const already = said(r.alreadyText) ?? (r.alreadyQueued > 0 ? `${titleCount(r.alreadyQueued)} already in the queue` : null);
  if (already) toasts.push({ state: 'neutral', text: already });
  return toasts;
}

/** The warning banner for the titles the queue didn't take, or for nothing
 *  queued at all ("Nothing was queued: no title was selected."), in
 *  katalog-manager's words, with each title it didn't take and why for
 *  under details; null when it says nothing of the kind. A server that
 *  counts titles skipped without saying it gets a sentence from the count. */
export function notQueuedBanner(
  r: Pick<ComplianceQueued, 'skipped' | 'skippedTitles' | 'message' | 'notQueuedText'>,
): { text: string; detail: string } | null {
  const skips = r.skippedTitles ?? [];
  const n = Math.max(r.skipped, skips.length);
  const why = (reason: string) => reason.trim().replace(/\.$/, '');
  const detail = skips.length ? skips.map((x) => `${x.title}: ${why(x.reason)}`).join('\n') : n ? r.message.trim() : '';
  const text = said(r.notQueuedText);
  if (text) return { text, detail };
  if (n === 0) return null;
  if (n === 1) {
    return { text: skips[0]?.reason.trim() ? `1 title wasn’t queued: ${why(skips[0].reason)}.` : '1 title wasn’t queued.', detail };
  }
  return { text: `${fmtCount(n)} titles weren’t queued.`, detail };
}

// ---- sizes

const MB = 1e6;
const GB = 1e9;
const TB = 1e12;
const NBSP = ' ';

function tenths(v: number, unit: string): string {
  const t = Math.round(v * 10);
  return `${t % 10 === 0 ? String(t / 10) : (t / 10).toFixed(1)}${NBSP}${unit}`;
}

/** A size as chino's downloads write sizes: decimal units, as storage counts
 *  them; GB with one decimal and no trailing zero ("1.4 GB", "18 GB"), MB
 *  below 1 GB ("724 MB", never "0 MB" for something there is), and TB, the
 *  same way, from 1,000 GB; the unit never on a line of its own. '—' for
 *  none. */
export function fmtBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
  const mb = Math.round(n / MB);
  if (mb < 1000) return `${n > 0 ? Math.max(1, mb) : 0}${NBSP}MB`;
  // 999.96 GB rounds to a TB: "1 TB", not "1000 GB"
  if (Math.round((n / GB) * 10) < 10000) return tenths(n / GB, 'GB');
  return tenths(n / TB, 'TB');
}

/** A size of the list: '—' for none or nothing. */
export function sizeText(n: number | null | undefined): string {
  return n != null && n > 0 ? fmtBytes(n) : '—';
}


// ---- the report's states

/** True when katalog-manager does not know the report: an older one answers
 *  that the query (or its types) is no field (graph-gophers' validation
 *  errors). */
export function notCheckedHere(error: string | null | undefined): boolean {
  if (!error) return false;
  return (
    /Cannot query field "(libraryCompliance|pipelineRules|queueRework|queueReworkMatching|refreshCompliance)" on type "(Query|Mutation)"/.test(error) ||
    /Unknown type "Compliance(Kind|Rule)"/.test(error)
  );
}

/** Why the list couldn't load, as the couldn't-load state says it: its title,
 *  the reason only (nothing the button says), whether trying again can help,
 *  and the technical detail for under "details". Told apart by the HTTP
 *  status gql reports ("katalog-manager 502"), a fetch that got no answer,
 *  and GraphQL's errors: a katalog-manager without the rules check, a query
 *  it doesn't take, or a problem it ran into. */
export function loadFailure(e: unknown): { title: string; reason: string; retry: boolean; detail: string } {
  const message = e instanceof Error ? e.message : String(e);
  const title = 'couldn’t load the rules';
  const unreachable = { title, reason: 'Can’t reach the server.', retry: true, detail: message };
  if (e instanceof TypeError) return unreachable;
  const http = /^katalog-manager (\d{3})$/.exec(message);
  if (http) {
    const status = Number(http[1]);
    const detail = `HTTP ${status}`;
    if (status === 408) return { ...unreachable, detail };
    if (status === 429) return { title, reason: 'The server is busy.', retry: true, detail };
    if (status >= 500) return { title, reason: 'The server ran into a problem.', retry: true, detail };
    if (status === 403) return { title: 'you don’t have access to this', reason: '', retry: false, detail };
    return { title, reason: 'The server didn’t accept the request. Check for an app update.', retry: true, detail };
  }
  if (e instanceof Error && e.name === 'GqlError') {
    if (notCheckedHere(message)) {
      return { title, reason: 'The catalog service on this server is older than this console and has no rules check.', retry: false, detail: `katalog-manager: ${message}` };
    }
    if (/Cannot query field|Unknown (type|argument)/.test(message)) {
      return { title, reason: 'The server didn’t accept the request.', retry: true, detail: message };
    }
  }
  return { title, reason: 'The server ran into a problem.', retry: true, detail: message };
}

/** The banner while the list on the screen couldn't be read again: how old
 *  what it shows is. */
export function staleText(loadedAt: number | null, now: number): string {
  const when = loadedAt ? ago(new Date(loadedAt).toISOString(), now) : '';
  return when ? `Couldn’t refresh the list; it shows what was loaded ${when}.` : 'Couldn’t refresh the list.';
}

/** Where the report's check stands: a check running, checked (evaluatedAt
 *  says when), or never checked. */
export function checkState(r: Pick<ComplianceReport, 'evaluating' | 'evaluatedAt'>): 'checking' | 'checked' | 'never' {
  return r.evaluating ? 'checking' : r.evaluatedAt ? 'checked' : 'never';
}

/** What takes the table's place when no title is listed, by what is true:
 *  never checked (and no check running), no match for the search and the
 *  rules picked, or nothing breaking the rules (those checked, when some
 *  aren't); null while the first check runs, which the facts line says. */
export function emptyState(
  r: Pick<ComplianceReport, 'evaluating' | 'evaluatedAt' | 'notEvaluated'>,
  f: ComplianceFilter,
): { kind: 'unknown' | 'nomatch' | 'done'; title: string; text: string } | null {
  if (!r.evaluatedAt) {
    return r.evaluating ? null : { kind: 'unknown', title: 'not checked', text: 'The titles haven’t been checked against the rules.' };
  }
  if (f.search.trim() || f.rules.length) {
    return { kind: 'nomatch', title: 'no matches', text: 'Nothing in this list matches the search and filters.' };
  }
  const every = f.kind === 'MOVIE' ? 'Every movie' : f.kind === 'EPISODE' ? 'Every episode' : 'Every title';
  return {
    kind: 'done',
    title: 'nothing breaks the rules',
    text: r.notEvaluated.length ? `${every} follows the rules that were checked.` : `${every} follows the rules.`,
  };
}

/** How often the tab reads the report again by itself, in ms: often while a
 *  check runs, slowly while the queue holds titles, else never (0). */
export function pollMs(
  r: Pick<ComplianceReport, 'evaluating' | 'queue'> | null,
  rows: readonly Pick<ComplianceRow, 'queue'>[],
): number {
  if (!r) return 0;
  if (r.evaluating) return 5_000;
  return r.queue.queued + r.queue.processing > 0 || rows.some((x) => inQueue(x.queue)) ? 30_000 : 0;
}

/** A worker's name as the rules panel heads it: the word for it, with the
 *  name it reported when that is another. */
export function workerName(slot: string, w: Pick<WorkerRules, 'worker'>): string {
  const name = w.worker.trim();
  return name && name !== slot ? `${slot} (${name})` : slot;
}
