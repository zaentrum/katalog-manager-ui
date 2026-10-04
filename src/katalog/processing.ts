// Pure helpers for the processing views (the processing tab, an item's step
// timeline, a series' structure): no React, no DOM, so `npm test` runs them
// under node as they are.
import { episodeLabel } from './people.ts';

/** The steps in the order the pipeline runs them, as katalog-manager knows
 *  them. */
export const STEP_ORDER = [
  'scan',
  'tmdb',
  'tidb',
  'chapter',
  'chromaprint',
  'blackframe',
  'silence',
  'subtitle',
  'transcode',
  'package',
] as const;

const STEP_LABELS: Record<string, string> = {
  scan: 'Scan',
  tmdb: 'Metadata',
  tidb: 'Intro Lookup',
  chapter: 'Chapters',
  chromaprint: 'Fingerprints',
  blackframe: 'Black Frames',
  silence: 'Silence',
  subtitle: 'Subtitles',
  transcode: 'Transcode',
  package: 'Package',
};

/** A step's short label; a step the console does not know keeps its name. */
export function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}

/** The choices of a step filter: every step, then each in pipeline order. */
export function stepOptions(): { label: string; value: string }[] {
  return [{ label: 'All Steps', value: '' }, ...STEP_ORDER.map((s) => ({ label: stepLabel(s), value: s }))];
}

/** steps in pipeline order; a step the console does not know comes after,
 *  by name. */
export function inPipelineOrder<T extends { step: string }>(steps: readonly T[]): T[] {
  const at = (s: string) => {
    const i = (STEP_ORDER as readonly string[]).indexOf(s);
    return i < 0 ? STEP_ORDER.length : i;
  };
  return [...steps].sort((a, b) => at(a.step) - at(b.step) || a.step.localeCompare(b.step));
}

/** A step as katalog-manager's processingSteps give it. */
export interface StepRun {
  step: string;
  status: string;
  attempts: number | null;
  failures: number;
  error: string | null;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
  nextRetryAt: string | null;
  dispatchedAt: string | null;
}

/** True when the console offers a Retry: the step failed. (katalog-manager
 *  also retries a step silent past its timeout, which its reaper turns into
 *  a failure soon after; it refuses a step running or waiting within it.) */
export function canRetry(s: { status: string }): boolean {
  return s.status === 'failed';
}

function span(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const rest = min % 60;
  if (hr < 24) return rest ? `${hr}h ${rest}m` : `${hr}h`;
  const days = Math.floor(hr / 24);
  return hr % 24 ? `${days}d ${hr % 24}h` : `${days}d`;
}

/** How long ago iso was, short: "just now", "3m ago", "2h 5m ago"; '' for
 *  none or a time that cannot be read. */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const ms = now - t;
  return ms < 5000 ? 'just now' : `${span(ms)} ago`;
}

/** How long until iso, short: "in 2m", "in 1h 5m"; "now" once it is past;
 *  '' for none. */
export function until(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  return t - now < 1000 ? 'now' : `in ${span(t - now)}`;
}

/** A step's failures in a row, of the attempts the policy gives when known:
 *  "2 of 3", or "2". */
export function attemptsText(failures: number, maxAttempts?: number | null): string {
  return maxAttempts ? `${failures} of ${maxAttempts}` : String(failures);
}

/** Where a step's retry stands, in a few words: a failed step's next retry
 *  ("retry in 2m", "retry due"), or that none comes ("no retry left" when its
 *  attempts are used up, "no automatic retry" otherwise); a step sent again
 *  and waiting for its worker ("sent again 3m ago"); '' for the rest. */
export function retryState(
  s: { status: string; failures: number; nextRetryAt: string | null; dispatchedAt?: string | null },
  maxAttempts: number | null | undefined,
  now: number,
): string {
  if (s.status === 'failed') {
    if (s.nextRetryAt) {
      const when = until(s.nextRetryAt, now);
      return when === 'now' ? 'retry due' : `retry ${when}`;
    }
    return maxAttempts && s.failures >= maxAttempts ? 'no retry left' : 'no automatic retry';
  }
  if (s.status === 'pending' && s.dispatchedAt) return `sent again ${ago(s.dispatchedAt, now)}`;
  return '';
}

/** A failed step's item, as the processing tab names it: an episode with its
 *  series and its place in it, "Pioneer One · S01E02 · Earthfall". */
export function failedTitle(f: {
  itemTitle: string;
  seriesTitle?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}): string {
  const parts = [f.seriesTitle, episodeLabel(f.seasonNumber, f.episodeNumber), f.itemTitle].filter(
    (p): p is string => !!p && p.trim() !== '',
  );
  return parts.join(' · ') || '(untitled)';
}

/** The path of an item's page in the catalog app, from the base the console
 *  runs under: the management app ("/katalog-manage") links to the catalog
 *  app beside it ("/katalog"); the catalog app to itself. */
export function catalogItemHref(base: string, itemId: string): string {
  const b = base.replace(/\/+$/, '');
  const catalog = b.endsWith('-manage') ? b.slice(0, -'-manage'.length) : b;
  return `${catalog}/item/${encodeURIComponent(itemId)}`;
}

/** The counts of a step in the processing overview. */
export interface StepCounts {
  step: string;
  pending: number;
  inProgress: number;
  done: number;
  failed: number;
  skipped: number;
  notApplicable: number;
  retrying: number;
  stalled: number;
  timeoutSeconds: number;
}

/** The items a step holds, in all. */
export function stepTotal(c: StepCounts): number {
  return c.pending + c.inProgress + c.done + c.failed + c.skipped + c.notApplicable;
}

/** A timeout in seconds, short: "15m", "2h", "1h 30m". */
export function timeoutText(seconds: number): string {
  return span(seconds * 1000);
}

/** The retry policy's line: how the service retries by itself, or why it
 *  cannot retry at all. */
export function policyText(r: {
  available: boolean;
  automatic: boolean;
  reason?: string | null;
  maxAttempts: number;
  backoffSeconds: number;
  backoffMaxSeconds: number;
  intervalSeconds: number;
}): string {
  if (!r.available) return `retries unavailable: ${r.reason ?? 'the service cannot retry'}`;
  if (!r.automatic) return 'no automatic retries: a failed step is retried by hand';
  return (
    `automatic retries: ${r.maxAttempts} attempts in a row, waiting ${timeoutText(r.backoffSeconds)} ` +
    `doubling to ${timeoutText(r.backoffMaxSeconds)}, checked every ${timeoutText(r.intervalSeconds)}`
  );
}

// ---- a series' structure

/** An episode as a series' structure lists it. */
export interface EpisodeRow {
  id: string;
  title: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  isPackaged: boolean;
  overallStatus: { overallStatus: string | null; failedCount?: number | null } | null;
}

/** A season of a series, with its episodes in order and how many are in
 *  each state. */
export interface Season {
  key: string;
  number: number | null;
  label: string;
  episodes: EpisodeRow[];
  states: Record<string, number>;
}

/** An episode's processing state: katalog-manager's overall status of its
 *  steps (complete, processing, queued, failed, partial_failure, pending,
 *  not_applicable), unknown without one. */
export function episodeState(e: EpisodeRow): string {
  return e.overallStatus?.overallStatus || 'unknown';
}

/** The seasons of a series' episodes: numbered seasons first, in order, then
 *  the specials (season 0), then the episodes without a season; each
 *  season's episodes by number (unnumbered last), then by title. */
export function seasonsOf(episodes: readonly EpisodeRow[]): Season[] {
  const by = new Map<string, Season>();
  for (const e of episodes) {
    const n = e.seasonNumber;
    const key = n == null ? 'none' : String(n);
    let s = by.get(key);
    if (!s) {
      s = {
        key,
        number: n,
        label: n == null ? 'No Season' : n === 0 ? 'Specials' : `Season ${n}`,
        episodes: [],
        states: {},
      };
      by.set(key, s);
    }
    s.episodes.push(e);
    const st = episodeState(e);
    s.states[st] = (s.states[st] ?? 0) + 1;
  }
  const rank = (s: Season) => (s.number == null ? Number.MAX_SAFE_INTEGER : s.number === 0 ? Number.MAX_SAFE_INTEGER - 1 : s.number);
  const seasons = [...by.values()].sort((a, b) => rank(a) - rank(b));
  for (const s of seasons) {
    s.episodes.sort(
      (a, b) =>
        (a.episodeNumber ?? Number.MAX_SAFE_INTEGER) - (b.episodeNumber ?? Number.MAX_SAFE_INTEGER) ||
        a.title.localeCompare(b.title),
    );
  }
  return seasons;
}

const STATE_ORDER = ['failed', 'partial_failure', 'processing', 'queued', 'pending', 'complete', 'not_applicable', 'unknown'];

/** A season's summary: its episodes, then how many are in each state, the
 *  ones that need attention first: "10 episodes · 1 failed · 8 complete". */
export function seasonSummary(s: Season): string {
  const n = s.episodes.length;
  const parts = [`${n} ${n === 1 ? 'episode' : 'episodes'}`];
  const states = Object.keys(s.states).sort(
    (a, b) => (STATE_ORDER.indexOf(a) + 1 || 99) - (STATE_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  for (const st of states) parts.push(`${s.states[st]} ${st.replace(/_/g, ' ')}`);
  return parts.join(' · ');
}
