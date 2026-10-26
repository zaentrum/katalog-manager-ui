import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useAuth } from 'react-oidc-context';
import { Badge, Button, Checkbox, Field, Heading, Input, Modal, Select, Spinner, Table, Tbody, Td, Text, Th, Thead, Tr } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Download,
  FileVideo,
  Info,
  RefreshCw,
  Search,
  SearchX,
} from 'lucide-react';
import { KATALOG_BASE, useGql } from '../lib/gql';
import { useQuery } from '../lib/useQuery';
import { BASE_NOSLASH } from '../lib/basepath';
import { fmtTime } from './status';
import { catalogItemHref } from './processing';
import {
  CLEARED_FILTER,
  DEFAULT_FILTER,
  DEFAULT_ORDER,
  KIND_OPTIONS,
  NO_SELECTION,
  announceText,
  appendRows,
  ariaSort,
  audioLines,
  bitrateText,
  canProcess,
  checkCounts,
  checkState,
  checkedRules,
  checkedSummary,
  confirmBody,
  confirmFacts,
  countText,
  csvFileName,
  csvUrl,
  deletesOriginals,
  dispositionName,
  emptyState,
  ESTIMATE,
  everChecked,
  filterKey,
  filterVariables,
  fmtBitrate,
  fmtCount,
  hiddenCount,
  inRuleOrder,
  isBlocked,
  isFiltering,
  isOnlyRule,
  isSelected,
  keepChecked,
  loadFailure,
  matchingScope,
  nextOrder,
  notQueuedBanner,
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
  refusedMatching,
  selectionText,
  signedSizeText,
  sizeText,
  staleText,
  summaryNote,
  summaryWithoutEstimate,
  titlesOf,
  withRule,
  workerName,
  type ComplianceFilter,
  type ComplianceKind,
  type ComplianceOrder,
  type ComplianceProcessing,
  type ComplianceQueued,
  type ComplianceReport,
  type ComplianceRow,
  type ComplianceRule,
  type ComplianceSort,
  type ComplianceSummary,
  type ComplianceTotals,
  type ProcessScope,
  type WorkerRules,
} from './compliance';

// katalog-manager answers a page of this many titles at a time.
const PAGE = 100;

// everyRule: the summary's titles are every rule's, whatever rules the
// filter names; while it names some, how many of them have no estimate is
// read beside the report
const REPORT_Q = `query Rules($kind: ComplianceKind, $rules: [ComplianceRule!], $search: String, $sort: ComplianceSort, $descending: Boolean, $first: Int, $after: String, $everyRule: Boolean!) {
  libraryCompliance(kind: $kind, rules: $rules, search: $search, sort: $sort, descending: $descending, first: $first, after: $after) {
    rules {
      transcoder { worker version reportedAt rules { key label value detail } }
      packager { worker version reportedAt rules { key label value detail } }
    }
    notEvaluated evaluatedAt evaluating
    matching { titles originalBytes packageBytes estimatedBytes withoutEstimate }
    queueable { titles originalBytes packageBytes estimatedBytes withoutEstimate fingerprint }
    queue { queued processing processed failed }
    processing { originals inflight window }
    summary { rule titles packageBytes estimatedBytes withoutEstimate evaluated }
    rows {
      itemId title year kind seriesId seriesTitle season episode
      resolution videoCodec videoBitrate videoBitrateEstimated bitrateCap packageAudio originalAudio
      findings { rule text measured limit detail }
      originalBytes packageBytes estimatedBytes outcome queue queueReason queueDetail reworkBlocked evaluatedAt
    }
    nextCursor
  }
  everyRule: libraryCompliance(kind: $kind, search: $search, first: 0) @include(if: $everyRule) {
    matching { withoutEstimate }
  }
}`;
// Every title the check looked at and every one that breaks a rule, whatever
// the filter: the check's line and the filter bar's "230 of 279"; and when it
// looked, for the check's line while no title is of the filter's kind and
// search
const ALL_Q = `query RulesAll { libraryCompliance(first: 1) { checkedTitles evaluatedAt matching { titles } } }`;
const QUEUED = `queued alreadyQueued skipped skippedTitles { itemId title reason } message queuedText alreadyText notQueuedText`;
const QUEUE_ITEMS = `mutation($items: [ID!]!) { queueRework(items: $items) { ${QUEUED} } }`;
// expected and fingerprint: the titles the confirm named, their number and
// their set's; katalog-manager queues none when the filter matches others
// by then
const QUEUE_MATCHING = `mutation($kind: ComplianceKind, $rules: [ComplianceRule!], $search: String, $expected: Int!, $fingerprint: String!) {
  queueReworkMatching(kind: $kind, rules: $rules, search: $search, expected: $expected, fingerprint: $fingerprint) { ${QUEUED} }
}`;
const CHECK = `mutation($kind: ComplianceKind) { refreshCompliance(kind: $kind) }`;

/** Titles the confirm asks about: those named, or every title that matches
 *  the filter; and how this installation processes them, as the report said
 *  when the confirm opened. */
interface Processing {
  scope: ProcessScope;
  items: string[];
  matching: ComplianceFilter | null;
  // the set of every match the confirm named, as the report fingerprinted it
  fingerprint: string;
  // from the selection toolbar: once queued, the selection is cleared
  bulk: boolean;
  settings: ComplianceProcessing | null;
}

/** A banner about something that failed: what, and the technical detail
 *  for under "details". */
interface Problem {
  state: 'warning' | 'error';
  text: string;
  detail: string;
  retry: boolean;
}

type Reading = 'first' | 'more' | 'refresh';

// useReport reads the report a page at a time, in the order asked for: a
// change of the filter or of the order reads it afresh from the top, "show
// more" adds the next page, and a refresh reads as many rows again as are
// shown, so people keep their place and the rows' statuses are current. A
// response for a filter or an order changed since is dropped.
function useReport(filter: ComplianceFilter, order: ComplianceOrder) {
  const gql = useGql();
  const key = `${filterKey(filter)}|${order.sort}|${order.descending}`;
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  // the summary's titles with no estimate, each once
  const [unestimated, setUnestimated] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState<Reading | null>('first');
  const seq = useRef(0);
  const at = useRef({ vars: { ...filterVariables(filter), ...order }, rows: [] as ComplianceRow[], cursor: null as string | null, busy: false });
  // the latest fetcher: a silent renew of the token does not read the report again
  const gqlRef = useRef(gql);
  gqlRef.current = gql;

  const read = useCallback(async (how: Reading) => {
    const s = at.current;
    if (how === 'more' && !s.cursor) return;
    const id = ++seq.current;
    s.busy = true;
    setLoading(how);
    try {
      const first = how === 'refresh' ? Math.max(PAGE, s.rows.length) : PAGE;
      const d = await gqlRef.current<{
        libraryCompliance: ComplianceReport;
        everyRule?: { matching: Pick<ComplianceTotals, 'withoutEstimate'> };
      }>(REPORT_Q, {
        ...s.vars,
        everyRule: !!s.vars.rules?.length,
        first,
        after: how === 'more' ? s.cursor : null,
      });
      if (id !== seq.current) return;
      const r = d.libraryCompliance;
      s.rows = how === 'more' ? appendRows(s.rows, r.rows) : r.rows;
      s.cursor = r.nextCursor;
      setReport(r);
      setUnestimated(summaryWithoutEstimate(s.vars.rules, r.matching, d.everyRule?.matching));
      setRows(s.rows);
      setError(null);
      setLoadedAt(Date.now());
    } catch (e) {
      if (id === seq.current) setError(e);
    } finally {
      if (id === seq.current) {
        s.busy = false;
        setLoading(null);
      }
    }
  }, []);

  useEffect(() => {
    at.current.vars = { ...filterVariables(filter), sort: order.sort, descending: order.descending };
    at.current.cursor = null;
    void read('first');
    return () => {
      seq.current++;
      at.current.busy = false;
    };
    // the report is read again only when the filter asks for other titles,
    // or the order is another
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, read]);

  const refresh = useCallback(() => void read('refresh'), [read]);
  const more = useCallback(() => void read('more'), [read]);
  // a poll leaves a read under way alone
  const poll = useCallback(() => {
    if (!at.current.busy) void read('refresh');
  }, [read]);
  return { report, rows, unestimated, error, loadedAt, loading, refresh, more, poll };
}

// useDebounced is value once it has held still for ms: the search asks
// katalog-manager when the typing stops, not at every key.
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// useBarHeight is the height of the shell's top bar, which stays at the top:
// the selection toolbar stays in view right under it.
function useBarHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.sh__bar');
    if (!bar) return;
    setH(bar.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setH(bar.offsetHeight));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  return h;
}

// useDownload fetches a file katalog-manager serves behind its auth and
// saves it under the name katalog-manager gives it, else fallback: a link
// can't send the Authorization header, so the bytes are fetched like every
// other API call and handed to the browser as a blob.
function useDownload() {
  const auth = useAuth();
  // read the token at fetch time: a silent renew must not change the function
  const token = useRef(auth.user?.access_token);
  token.current = auth.user?.access_token;
  return useCallback(async (url: string, fallback: string) => {
    const bearer = token.current;
    const res = await fetch(url, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
    if (!res.ok) throw new Error(`katalog-manager ${res.status}`);
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href;
    a.download = dispositionName(res.headers.get('Content-Disposition')) ?? fallback;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // once the browser has taken the file
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  }, []);
}

interface ToastItem {
  id: number;
  state: 'success' | 'neutral';
  text: string;
}

// useToasts holds the toasts showing, at most three, the newest last.
function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => setItems((xs) => [...xs, { ...t, id: next.current++ }].slice(-3)), []);
  const gone = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  return { items, push, gone };
}

// RulesView is the report of the titles that break the rules the transcoder
// and the packager report, as the check measured them: when it ran, how many
// titles break each rule and the queue's progress, the rules in force, and
// the titles with their measures, sorted on the server and saved as a CSV,
// processed again one at a time, by a selection or every one that matches,
// through the re-encode queue.
export function RulesView() {
  const gql = useGql();
  const download = useDownload();
  const [kind, setKind] = useState<ComplianceKind | ''>(DEFAULT_FILTER.kind);
  const [rules, setRules] = useState<ComplianceRule[]>(DEFAULT_FILTER.rules);
  const [typed, setTyped] = useState('');
  const search = useDebounced(typed, 300);
  const filter = useMemo<ComplianceFilter>(() => ({ kind, rules, search }), [kind, rules, search]);
  const key = filterKey(filter);
  const [order, setOrder] = useState<ComplianceOrder>(DEFAULT_ORDER);
  const { report, rows, unestimated, error, loadedAt, loading, refresh, more, poll } = useReport(filter, order);
  const all = useQuery<{ libraryCompliance: { checkedTitles: number | null; evaluatedAt: string | null; matching: { titles: number } } }>(ALL_Q);
  const [sel, dispatch] = useReducer(select, NO_SELECTION);
  const [processing, setProcessing] = useState<Processing | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  // every match refused, as it changed since the confirm: once the list is
  // read again, its rows on the screen are ticked, so the toolbar offers
  // every match as it is now
  const reoffer = useRef(false);
  const toasts = useToasts();
  const toolbar = useRef<HTMLDivElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const barHeight = useBarHeight();

  // a change of the filter keeps the ticked rows; every match of another
  // filter is no selection any more. The order changes neither.
  useEffect(() => {
    dispatch({ type: 'filter', key });
  }, [key]);
  // rows read again: ticked rows as they are now
  useEffect(() => {
    dispatch({ type: 'loaded', rows });
    if (reoffer.current) {
      reoffer.current = false;
      dispatch({ type: 'clear' });
      dispatch({ type: 'page', on: true, rows });
    }
  }, [rows]);

  // read again by itself while a check runs or the queue holds titles
  const every = pollMs(report, rows);
  useEffect(() => {
    if (!every) return;
    const t = setInterval(poll, every);
    return () => clearInterval(t);
  }, [every, poll]);

  // the rules the check holds the titles against: the summary and the filter
  // offer no other, and a rule ticked that it no longer holds them against
  // leaves the filter
  const checked = useMemo(() => checkedRules(report?.summary), [report?.summary]);
  useEffect(() => {
    setRules((rs) => keepChecked(rs, checked));
  }, [checked]);

  // a check that has run since: the counts of the check's line again
  const refetchAll = all.refetch;
  const checkedAt = report?.evaluatedAt;
  const lastCheck = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (checkedAt === undefined) return;
    if (lastCheck.current !== undefined && lastCheck.current !== checkedAt) refetchAll();
    lastCheck.current = checkedAt;
  }, [checkedAt, refetchAll]);

  // a read that failed with the list on the screen: a banner says how old it is
  const stale: Problem | null =
    report && error ? { state: 'warning', text: staleText(loadedAt, Date.now()), detail: loadFailure(error).detail, retry: true } : null;

  const pushToast = toasts.push;
  // after the dialog has closed and given the focus back to its opener
  const [refocus, setRefocus] = useState<string | null>(null);
  useEffect(() => {
    if (!refocus) return;
    if (refocus === 'toolbar') toolbar.current?.focus();
    else {
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a.kat__cell-title'))
        .find((a) => a.getAttribute('href') === refocus)
        ?.focus();
    }
    setRefocus(null);
  }, [refocus]);
  // stable: the dialog would take its focus back to its first control on
  // every render of the tab otherwise
  const close = useCallback(() => setProcessing(null), []);
  const queued = useCallback(
    (r: ComplianceQueued, p: Processing) => {
      setProcessing(null);
      // titles the queue didn't take, or nothing queued at all, are a
      // failure: a warning banner
      const notQueued = notQueuedBanner(r);
      setProblem(notQueued ? { state: 'warning', text: notQueued.text, detail: notQueued.detail, retry: false } : null);
      for (const t of queuedToasts(r)) pushToast(t);
      if (p.bulk) dispatch({ type: 'clear' });
      if (p.matching && refusedMatching(r)) reoffer.current = true;
      // the button that opened the dialog goes with the selection, or turns
      // disabled once the queue holds its title: the toolbar, or the title,
      // takes the focus instead
      setRefocus(p.bulk ? 'toolbar' : catalogItemHref(BASE_NOSLASH, p.items[0]));
      refresh();
      refetchAll();
    },
    [refresh, refetchAll, pushToast],
  );
  const failed = useCallback((e: unknown) => {
    setProcessing(null);
    setProblem({ state: 'error', text: 'Couldn’t queue the titles.', detail: loadFailure(e).detail, retry: false });
  }, []);

  async function checkAgain() {
    setChecking(true);
    setProblem(null);
    try {
      await gql<{ refreshCompliance: boolean }>(CHECK, { kind: filter.kind || null });
    } catch (e) {
      setProblem({ state: 'error', text: 'Couldn’t start a check.', detail: loadFailure(e).detail, retry: false });
    } finally {
      setChecking(false);
      refresh();
    }
  }

  // every row the filter matches, in the table's order, as a CSV
  async function saveCsv() {
    setSaving(true);
    try {
      await download(csvUrl(KATALOG_BASE, filter, order), csvFileName(filter.kind, report?.evaluatedAt ?? null));
    } catch (e) {
      setProblem({ state: 'error', text: 'Couldn’t download the CSV.', detail: loadFailure(e).detail, retry: false });
    } finally {
      setSaving(false);
    }
  }

  function clearAll() {
    // the button disables itself: the search takes the focus first
    searchField.current?.focus();
    setKind(CLEARED_FILTER.kind);
    setRules(CLEARED_FILTER.rules);
    setTyped(CLEARED_FILTER.search);
  }

  const toggleDetails = useCallback(
    (id: string) =>
      setOpened((open) => {
        const next = new Set(open);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );

  const head = (
    <header className="kat__wl-head">
      <Heading level={2} id="rules-title">
        rules
      </Heading>
      <Text variant="muted">Titles that break a rule the transcoder or the packager reports.</Text>
    </header>
  );

  if (!report) {
    if (error) {
      const why = loadFailure(error);
      return (
        <section className="kat__rules" aria-labelledby="rules-title">
          {head}
          <Empty
            icon={why.retry ? AlertTriangle : Info}
            title={why.title}
            text={why.reason}
            detail={why.detail}
            action={
              why.retry ? (
                <Button size="sm" leading={<RefreshCw size={14} />} onClick={refresh}>
                  try again
                </Button>
              ) : null
            }
          />
        </section>
      );
    }
    return (
      <section className="kat__rules" aria-labelledby="rules-title">
        {head}
        <div className="kat__state">
          <Spinner /> <Text variant="muted">loading rules…</Text>
        </div>
      </section>
    );
  }

  const matching = report.matching.titles;
  // what "select all" ticks and queues: the matches the queue would take
  const queueable = report.queueable.titles;
  const count = selectedCount(sel, queueable);
  const hidden = hiddenCount(sel, rows);
  const headBox = pageState(sel, rows);
  const pickable = rows.filter(canProcess);
  // the check has looked at a title, of the filter's or another
  const ever = everChecked(report, all.data?.libraryCompliance.checkedTitles, filter);
  const empty = emptyState(report, filter, ever);
  const counts = checkCounts(all.data?.libraryCompliance.checkedTitles, all.data?.libraryCompliance.matching.titles);

  const settings = report.processing;
  const fingerprint = report.queueable.fingerprint ?? '';
  const open = (p: Omit<Processing, 'settings' | 'fingerprint'>) => setProcessing({ ...p, settings, fingerprint });
  function processSelection() {
    if (!report) return;
    if (sel.mode === 'matching') {
      open({ scope: matchingScope(report.queueable), items: [], matching: filter, bulk: true });
      return;
    }
    open({ scope: rowsScope(sel.rows), items: sel.rows.map((r) => r.itemId), matching: null, bulk: true });
  }

  const num = (s: string, title?: string) => (
    <span className="kat__num" title={title}>
      {s}
    </span>
  );
  const cols: ResultColumn[] = [
    {
      key: 'select',
      className: 'kat__col-select',
      header: (
        <Checkbox
          aria-label="select every visible row"
          checked={headBox === 'all'}
          indeterminate={headBox === 'some'}
          disabled={pickable.length === 0}
          onChange={(e) => dispatch({ type: 'page', on: e.target.checked, rows })}
        />
      ),
      // a title the queue holds, or that processing again can't help, can't
      // be ticked: its name says why
      render: (r) => (
        <Checkbox
          aria-label={rowControlNames(r).select}
          checked={isSelected(sel, r)}
          disabled={!canProcess(r)}
          onChange={(e) => dispatch({ type: 'row', row: r, on: e.target.checked, loaded: rows })}
        />
      ),
    },
    {
      key: 'title',
      className: 'kat__col-title',
      header: 'title',
      sort: 'TITLE',
      render: (r) => {
        const isOpen = opened.has(r.itemId);
        const full = rowTitle(r);
        const name = rowName(r);
        return (
          <div className="kat__titlecell">
            <a className="kat__rowlink kat__cell-title" href={catalogItemHref(BASE_NOSLASH, r.itemId)} title={full !== name ? full : undefined}>
              {name}
            </a>
            <button
              type="button"
              className={`kat__disclosure${isOpen ? ' kat__disclosure--open' : ''}`}
              aria-expanded={isOpen}
              aria-controls={isOpen ? detailsId(r) : undefined}
              onClick={() => toggleDetails(r.itemId)}
            >
              <ChevronRight size={12} aria-hidden />
              details<span className="kat__sr">: {full}</span>
            </button>
          </div>
        );
      },
    },
    { key: 'resolution', header: 'resolution', align: 'right', render: (r) => num(r.resolution?.trim() || '—') },
    { key: 'codec', header: 'codec', render: (r) => <span className="kat__nowrap">{r.videoCodec?.trim() || '—'}</span> },
    {
      key: 'bitrate',
      header: 'bit rate',
      align: 'right',
      sort: 'VIDEO_BITRATE',
      render: (r) => num(bitrateText(r), r.videoBitrateEstimated ? 'Worked out from the size and the duration' : undefined),
    },
    { key: 'cap', header: 'cap', align: 'right', render: (r) => num(fmtBitrate(r.bitrateCap)) },
    { key: 'original', header: 'original', align: 'right', sort: 'ORIGINAL_SIZE', render: (r) => num(sizeText(r.originalBytes)) },
    { key: 'package', header: 'package', align: 'right', sort: 'PACKAGE_SIZE', render: (r) => num(sizeText(r.packageBytes)) },
    // estimates: the mark once, in the header
    { key: 'after', header: ESTIMATE.after, headerTitle: ESTIMATE.tip, align: 'right', render: (r) => num(isBlocked(r) ? '—' : sizeText(r.estimatedBytes)) },
    {
      key: 'saving',
      header: ESTIMATE.saving,
      align: 'right',
      sort: 'SAVING',
      sortTitle: `package − ${ESTIMATE.after}`,
      render: (r) => num(isBlocked(r) ? '—' : signedSizeText(savingBytes(r))),
    },
    {
      key: 'audio',
      header: 'audio',
      render: (r) => (
        <span className="kat__audio" title={r.originalAudio?.trim() ? `original: ${r.originalAudio.trim()}` : undefined}>
          {audioLines(r.packageAudio).map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </span>
      ),
    },
    {
      key: 'rules',
      header: 'rules',
      render: (r) => (
        <span className="kat__tags">
          {[...new Set(inRuleOrder(r.findings).map((f) => f.rule))].map((rule) => (
            <span key={rule} className="kat__tag">
              {ruleTag(rule)}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: 'outcome',
      render: (r) => <span className={`kat__nowrap${isBlocked(r) ? ' kat__blocked' : ''}`}>{outcomeTag(r) || '—'}</span>,
    },
    {
      key: 'status',
      header: 'status',
      render: (r) => {
        const s = rowStatus(r.queue, r.queueReason);
        if (!s) return null;
        return (
          <div className="kat__status">
            <Badge tone={s.tone} dot>
              {s.word}
            </Badge>
            {s.detail && (
              <span className="kat__status-detail" title={s.detail}>
                {s.detail}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          leading={<FileVideo size={13} />}
          disabled={!canProcess(r)}
          aria-label={rowControlNames(r).process}
          onClick={() => open({ scope: rowsScope([r]), items: [r.itemId], matching: null, bulk: false })}
        >
          process again
        </Button>
      ),
    },
  ];

  const parts = queueParts(report.queue);
  const summary = checkedSummary(report.summary);
  const note = summaryNote(summary, unestimated);
  const banners = [
    report.notEvaluated.length ? (
      <Banner key="unchecked" state="warning">
        {report.notEvaluated.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </Banner>
    ) : null,
    (problem ?? stale) ? (
      <Banner
        key="problem"
        state={(problem ?? stale)!.state}
        detail={(problem ?? stale)!.detail}
        actions={
          problem ? (
            <Button variant="ghost" size="sm" onClick={() => setProblem(null)}>
              dismiss
            </Button>
          ) : (
            <Button variant="ghost" size="sm" leading={<RefreshCw size={14} />} onClick={refresh}>
              try again
            </Button>
          )
        }
      >
        <span>{(problem ?? stale)!.text}</span>
      </Banner>
    ) : null,
  ];

  return (
    <section className="kat__rules" aria-labelledby="rules-title">
      {head}
      <CheckLine
        report={report}
        ever={ever}
        checkedAt={report.evaluatedAt ?? all.data?.libraryCompliance.evaluatedAt ?? null}
        counts={counts}
        checking={checking}
        onCheck={() => void checkAgain()}
      />
      {banners}

      {/* until the check has looked at a title, the not-checked state alone:
          no summary, rules in force or filters */}
      {ever && summary.length > 0 && (
        <div className="kat__summary">
          <h3 className="kat__h3">by rule</h3>
          <ScrollEdges>
            <SummaryTable
              summary={summary}
              rules={rules}
              describedBy={note ? 'rules-summary-note' : undefined}
              onPick={(rule) => setRules(pickRule(rules, rule))}
            />
          </ScrollEdges>
          {/* the titles its packages now and after leave out */}
          {note && (
            <p id="rules-summary-note" className="kat__summary-note">
              {note}
            </p>
          )}
          {parts.length > 0 && (
            <p className="kat__queue">
              <span className="kat__queue-label">queue</span>
              {parts.map((p, i) => (
                <Fragment key={p.word}>
                  {i > 0 && <span className="kat__muted"> · </span>}
                  <span className={p.tone ? `kat__count--${p.tone}` : undefined}>{p.count}</span> {p.word}
                </Fragment>
              ))}
            </p>
          )}
        </div>
      )}

      {ever && <RulesPanel report={report} />}

      {/* the filters and the table take more of the screen than the column
          above them, where there is more; the not-checked state alone keeps
          to the column */}
      <div className={ever ? 'kat__wide' : undefined}>
        {ever && (
          <div className="kat__filterbar" role="search" aria-label="filters">
            <div className="kat__filters">
              <Field label="search">
                <Input
                  ref={searchField}
                  type="search"
                  placeholder="search titles"
                  value={typed}
                  leading={<Search size={14} />}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </Field>
              <Field label="kind">
                <Select value={kind} onChange={(e) => setKind(e.target.value as ComplianceKind | '')} options={KIND_OPTIONS} />
              </Field>
              <div className="kat__spacer" />
              <div className="kat__filter-end">
                {loading === 'first' && <Spinner size={14} label="loading titles" />}
                <span className="kat__count" aria-live="polite" aria-atomic="true">
                  {countText(matching, all.data?.libraryCompliance.matching.titles, isFiltering(filter))}
                </span>
                <Button variant="ghost" size="sm" leading={<Download size={14} />} loading={saving} disabled={matching === 0} onClick={() => void saveCsv()}>
                  {/* one label: the button's words are lowercase, the format's name isn't */}
                  <span>
                    download <span className="kat__keepcase">CSV</span>
                  </span>
                </Button>
                <Button variant="ghost" size="sm" disabled={!isFiltering({ kind, rules, search: typed })} onClick={clearAll}>
                  clear all
                </Button>
              </div>
            </div>
            <fieldset className="kat__rulepick">
              <legend>rules</legend>
              <div className="kat__rulepick-list">
                {checked.map((rule) => (
                  <Checkbox
                    key={rule}
                    label={<span className="kat__mono">{ruleTag(rule)}</span>}
                    checked={rules.includes(rule)}
                    onChange={(e) => setRules(withRule(rules, rule, e.target.checked))}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {rows.length === 0 ? (
          // not while the titles of a filter changed are on their way
          empty &&
          loading !== 'first' && (
            <Empty
              icon={empty.kind === 'done' ? CheckCircle2 : empty.kind === 'nomatch' ? SearchX : CircleHelp}
              title={empty.title}
              text={empty.text}
              action={
                empty.kind === 'nomatch' ? (
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    clear filters
                  </Button>
                ) : empty.kind === 'unknown' ? (
                  <Button size="sm" variant="primary" leading={<RefreshCw size={14} />} loading={checking} onClick={() => void checkAgain()}>
                    check the titles
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <>
            <SelectionToolbar
              boxRef={toolbar}
              top={barHeight}
              heading={titlesOf(kind, matching)}
              count={count}
              text={selectionText(count, hidden)}
              // not while a check runs: the titles that match may change under it
              offer={offersMatching(sel, rows, queueable) && !report.evaluating ? `select all ${fmtCount(queueable)} matching` : null}
              action={processLabel(count)}
              onClear={() => {
                dispatch({ type: 'clear' });
                toolbar.current?.focus();
              }}
              onSelectAll={() => {
                dispatch({ type: 'matching', key });
                toolbar.current?.focus();
              }}
              onAction={processSelection}
            />
            <ScrollEdges sticky>
              <ResultsTable columns={cols} rows={rows} order={order} onSort={(s) => setOrder(nextOrder(order, s))} opened={opened} />
            </ScrollEdges>
            {rows.length < matching && (
              <div className="kat__more">
                <Text variant="dim">
                  {fmtCount(rows.length)} of {fmtCount(matching)} shown
                </Text>
                {report.nextCursor && (
                  <Button variant="ghost" size="sm" loading={loading === 'more'} onClick={more}>
                    show more
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <Toaster items={toasts.items} onGone={toasts.gone} />
      {processing && <ProcessDialog processing={processing} onClose={close} onQueued={queued} onFailed={failed} />}
    </section>
  );
}

// CheckLine is the check in one line: when it ran, how many titles it
// checked and how many break a rule, or that it runs, with "check again".
// Nothing while no title was ever checked (ever): the empty state says it.
// checkedAt: when, of the report's titles, else of every title, while none
// is of the filter's kind and search.
function CheckLine({
  report,
  ever,
  checkedAt,
  counts,
  checking,
  onCheck,
}: {
  report: ComplianceReport;
  ever: boolean;
  checkedAt: string | null;
  counts: string[];
  checking: boolean;
  onCheck: () => void;
}) {
  const state = checkState(report, ever);
  if (state === 'never') return null;
  return (
    <div className="kat__checkline">
      {state === 'checking' && <Spinner size={12} />}
      <Text variant="muted">{state === 'checking' ? 'Checking the titles…' : [`Checked ${fmtTime(checkedAt)}`, ...counts].join(' · ')}</Text>
      <Button variant="ghost" size="sm" leading={<RefreshCw size={14} />} loading={checking} disabled={state === 'checking'} onClick={onCheck}>
        check again
      </Button>
    </div>
  );
}

// RulesPanel is the rules each worker reported.
function RulesPanel({ report }: { report: ComplianceReport }) {
  return (
    <div className="kat__panel kat__rules-panel">
      <div className="kat__workers">
        <WorkerBlock slot="transcoder" w={report.rules.transcoder} />
        <WorkerBlock slot="packager" w={report.rules.packager} />
      </div>
    </div>
  );
}

// WorkerBlock is what one worker reported of its rules, each setting by the
// worker's own label and in its words, the raw config under details, and
// when it reported; or that it never did.
function WorkerBlock({ slot, w }: { slot: string; w: WorkerRules | null }) {
  return (
    <div className="kat__worker">
      <div className="kat__worker-head">
        <h3 className="kat__h3">{w ? workerName(slot, w) : slot}</h3>
        {w?.version && <span className="kat__mono kat__muted">{w.version}</span>}
        {w ? <Text variant="dim">Reported {fmtTime(w.reportedAt)}</Text> : <Badge tone="amber">not reported</Badge>}
      </div>
      {w &&
        (w.rules.length ? (
          <dl className="kat__kv kat__settings">
            {w.rules.map((r) => (
              <Fragment key={r.key}>
                <dt>{r.label}</dt>
                <dd>
                  {r.value}
                  {r.detail?.trim() && <Details detail={r.detail.trim()} of={r.label} />}
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <Text variant="muted">It reported no rules.</Text>
        ))}
    </div>
  );
}

// SummaryTable is how many titles break each rule the check holds them
// against (checkedSummary), by its tag, and their packages now and estimated
// after; a rule lists its titles alone, and again every rule's. describedBy:
// the line under it, of the titles with no estimate.
function SummaryTable({
  summary,
  rules,
  describedBy,
  onPick,
}: {
  summary: ComplianceSummary[];
  rules: ComplianceRule[];
  describedBy?: string;
  onPick: (rule: ComplianceRule) => void;
}) {
  const cols: TableColumn<ComplianceSummary>[] = [
    {
      key: 'rule',
      header: 'rule',
      render: (s) => (
        <button type="button" className="kat__rulebtn" aria-pressed={isOnlyRule(rules, s.rule)} onClick={() => onPick(s.rule)}>
          {ruleTag(s.rule)}
        </button>
      ),
    },
    { key: 'titles', header: 'titles', align: 'right', render: (s) => (s.titles ? fmtCount(s.titles) : <span className="kat__muted">0</span>) },
    { key: 'packageBytes', header: 'now', align: 'right', render: (s) => <span className="kat__num">{sizeText(s.packageBytes)}</span> },
    {
      key: 'estimatedBytes',
      header: <span title={ESTIMATE.tip}>{ESTIMATE.after}</span>,
      align: 'right',
      render: (s) => <span className="kat__num">{sizeText(s.estimatedBytes)}</span>,
    },
  ];
  return <Table columns={cols} rows={inRuleOrder(summary)} rowKey={(s) => s.rule} dense aria-label="titles by rule" aria-describedby={describedBy} />;
}

/** A column of the report's table: its header, the order its header sorts
 *  in, and its cells. */
interface ResultColumn {
  key: string;
  header: ReactNode;
  // what the header means, on hover, where it doesn't sort
  headerTitle?: string;
  sort?: ComplianceSort;
  sortTitle?: string;
  align?: 'left' | 'right';
  className?: string;
  render: (r: ComplianceRow) => ReactNode;
}

const detailsId = (r: Pick<ComplianceRow, 'itemId'>) => `rules-details-${r.itemId}`;

// ResultsTable is the titles, a row each, with their measures in columns:
// a header that sorts sorts on the server, and a row's details open in a
// row of their own under it, what the columns don't say. Built from the
// table's parts, for the headers' sort and the rows of details.
function ResultsTable({
  columns,
  rows,
  order,
  onSort,
  opened,
}: {
  columns: ResultColumn[];
  rows: ComplianceRow[];
  order: ComplianceOrder;
  onSort: (sort: ComplianceSort) => void;
  opened: ReadonlySet<string>;
}) {
  return (
    <div className="nc-table__scroll">
      <table className="nc-table nc-table--dense kat__results" aria-label="titles">
        <Thead>
          <tr>
            {columns.map((c) => (
              <Th
                key={c.key}
                scope="col"
                className={c.className}
                style={{ textAlign: c.align ?? 'left' }}
                aria-sort={c.sort ? ariaSort(order, c.sort) : undefined}
                title={c.sort ? undefined : c.headerTitle}
              >
                {c.sort ? <SortButton label={c.header} sort={c.sort} order={order} title={c.sortTitle} onSort={onSort} /> : c.header}
              </Th>
            ))}
          </tr>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Fragment key={r.itemId}>
              <Tr>
                {columns.map((c) => (
                  <Td key={c.key} className={c.className} style={{ textAlign: c.align ?? 'left' }}>
                    {c.render(r)}
                  </Td>
                ))}
              </Tr>
              {opened.has(r.itemId) && (
                <tr id={detailsId(r)} className="kat__details-row">
                  <td className="nc-table__td" colSpan={columns.length}>
                    <RowDetails row={r} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </Tbody>
      </table>
    </div>
  );
}

// SortButton is a column's header that sorts the table by it: the biggest
// first, or the titles from A, and pressed again the other way. The arrow
// says which way it is sorted.
function SortButton({
  label,
  sort,
  order,
  title,
  onSort,
}: {
  label: ReactNode;
  sort: ComplianceSort;
  order: ComplianceOrder;
  title?: string;
  onSort: (sort: ComplianceSort) => void;
}) {
  const dir = ariaSort(order, sort);
  const Icon = dir === 'descending' ? ArrowDown : dir === 'ascending' ? ArrowUp : ArrowUpDown;
  return (
    <button type="button" className={`kat__sortbtn${dir !== 'none' ? ' kat__sortbtn--on' : ''}`} title={title} onClick={() => onSort(sort)}>
      {label}
      <Icon size={11} aria-hidden />
    </button>
  );
}

// RowDetails is what a row's columns don't say: each finding in
// katalog-manager's words with its technical part, why processing it again
// can't help, the queue's technical part and the original's audio. It stays
// in view on a table that scrolls sideways.
function RowDetails({ row }: { row: ComplianceRow }) {
  const lines = rowDetails(row);
  return (
    <div className="kat__rowdetails">
      <dl className="kat__detail-list">
        {lines.map((l, i) => (
          <Fragment key={`${l.label}/${i}`}>
            <dt>{l.label}</dt>
            <dd>
              {l.text && <span>{l.text}</span>}
              {l.detail && <code>{l.detail}</code>}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

// SelectionToolbar heads the table: what it holds, or, once rows are ticked,
// the count, clear, select all and the one action for exactly that
// selection. It stays in view under the top bar, is one tab stop whose
// controls the arrow keys move between, and reads out each change of the
// count.
function SelectionToolbar({
  boxRef: ref,
  top,
  heading,
  count,
  text,
  offer,
  action,
  onClear,
  onSelectAll,
  onAction,
}: {
  boxRef: RefObject<HTMLDivElement | null>;
  top: number;
  heading: string;
  count: number;
  text: string;
  offer: string | null;
  action: string;
  onClear: () => void;
  onSelectAll: () => void;
  onAction: () => void;
}) {
  const [said, setSaid] = useState('');
  const last = useRef(count);
  useEffect(() => {
    if (count !== last.current) setSaid(announceText(count));
    last.current = count;
  }, [count]);
  // one tab stop: the one with tabindex 0, the others -1
  useEffect(() => {
    const items = controls(ref.current);
    const current = items.find((b) => b.tabIndex === 0) ?? items[0];
    for (const b of items) b.tabIndex = b === current ? 0 : -1;
  });

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = controls(ref.current);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const to =
      e.key === 'ArrowRight' ? (i + 1) % items.length
        : e.key === 'ArrowLeft' ? (i - 1 + items.length) % items.length
          : e.key === 'Home' ? 0
            : e.key === 'End' ? items.length - 1
              : -1;
    if (to < 0 || items.length === 0) return;
    e.preventDefault();
    for (const b of items) b.tabIndex = -1;
    items[to].tabIndex = 0;
    items[to].focus();
  }

  return (
    <div
      ref={ref}
      className={`kat__seltool${count ? ' kat__seltool--on' : ''}`}
      role="toolbar"
      aria-label="titles"
      tabIndex={-1}
      style={{ top }}
      onKeyDown={onKeyDown}
    >
      {count ? (
        <>
          <span className="kat__seltool-count">{text}</span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            clear
          </Button>
          {offer && (
            <Button variant="ghost" size="sm" onClick={onSelectAll}>
              {offer}
            </Button>
          )}
          <span className="kat__spacer" />
          <Button variant="primary" size="sm" leading={<FileVideo size={13} />} onClick={onAction}>
            {action}
          </Button>
        </>
      ) : (
        <span className="kat__seltool-heading">{heading}</span>
      )}
      <span className="kat__sr" aria-live="polite">
        {said}
      </span>
    </div>
  );
}

// ScrollEdges holds a table that scrolls sideways where it is wider than the
// screen, and fades the edge it goes on past, so people see there is more;
// with sticky first columns, the fade on the left is the title column's
// edge. It hands its width down (--kat-visible), for what stays in view.
function ScrollEdges({ children, sticky = false }: { children: ReactNode; sticky?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<'' | 'left' | 'right' | 'both'>('');
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.nc-table__scroll');
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore(left && right ? 'both' : left ? 'left' : right ? 'right' : '');
      box.current?.style.setProperty('--kat-visible', `${el.clientWidth}px`);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, []);
  return (
    <div ref={box} className={`kat__hscroll${sticky ? ' kat__hscroll--sticky' : ''}`} data-more={more || undefined}>
      {children}
    </div>
  );
}

function controls(el: HTMLElement | null): HTMLElement[] {
  return el ? Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled])')) : [];
}

// Banner is a message about the list as a whole: what it leaves out, or a
// read or an action that failed, with the technical detail under "details".
function Banner({
  state,
  children,
  detail,
  actions,
}: {
  state: 'warning' | 'error';
  children: ReactNode;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={`kat__banner kat__banner--${state}`} role={state === 'error' ? 'alert' : 'status'}>
      <AlertTriangle size={15} aria-hidden className="kat__banner-glyph" />
      <div className="kat__banner-body">
        {children}
        {detail && <Details detail={detail} />}
      </div>
      {actions}
    </div>
  );
}

// Details is the technical part of something, one click away: an error, a
// tool's output, raw config. of names what it belongs to for a screen
// reader, where there are several.
function Details({ detail, of }: { detail: string; of?: string }) {
  return (
    <details className="kat__details">
      <summary>
        details{of && <span className="kat__sr">: {of}</span>}
      </summary>
      <code>{detail}</code>
    </details>
  );
}

// Empty takes the table's place when there is nothing to list, saying which
// kind of empty it is: its title, one sentence, and at most one way forward.
function Empty({
  icon: Icon,
  title,
  text,
  detail,
  action,
}: {
  icon: typeof Info;
  title: string;
  text: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="kat__empty">
      <Icon size={20} aria-hidden className="kat__muted" />
      <h3 className="kat__h3">{title}</h3>
      {text && <Text variant="muted">{text}</Text>}
      {detail && <Details detail={detail} />}
      {action}
    </div>
  );
}

// Toaster is where the toasts show, at the bottom of the screen: a polite
// live region that is there before the first toast.
function Toaster({ items, onGone }: { items: ToastItem[]; onGone: (id: number) => void }) {
  return (
    <section className="kat__toaster" aria-label="notifications">
      <ol className="kat__toasts" aria-live="polite" aria-relevant="additions text">
        {items.map((t) => (
          <Toast key={t.id} toast={t} onGone={onGone} />
        ))}
      </ol>
    </section>
  );
}

// Toast leaves after five seconds; while the pointer rests on it the count
// pauses, and goes on with the time that was left.
function Toast({ toast, onGone }: { toast: ToastItem; onGone: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(5000);
  useEffect(() => {
    if (paused) return;
    const from = Date.now();
    const t = setTimeout(() => onGone(toast.id), left.current);
    return () => {
      clearTimeout(t);
      left.current = Math.max(0, left.current - (Date.now() - from));
    };
  }, [paused, onGone, toast.id]);
  return (
    <li className={`kat__toast kat__toast--${toast.state}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {toast.state === 'success' ? <Check size={13} aria-hidden /> : <Info size={13} aria-hidden />}
      <span>{toast.text}</span>
    </li>
  );
}

// ProcessDialog asks before titles go to the re-encode queue, the same for
// one title and for many: its title the button's words, what processing them
// again does as this installation is set (the queue's pace and window, what
// becomes of the original: the danger button where it is deleted), and
// their packages now and estimated after.
function ProcessDialog({
  processing,
  onClose,
  onQueued,
  onFailed,
}: {
  processing: Processing;
  onClose: () => void;
  onQueued: (r: ComplianceQueued, p: Processing) => void;
  onFailed: (e: unknown) => void;
}) {
  const gql = useGql();
  const [busy, setBusy] = useState(false);
  const label = processLabel(processing.scope.titles);
  const facts = confirmFacts(processing.scope);

  async function submit() {
    setBusy(true);
    try {
      const r = processing.matching
        ? (
            await gql<{ queueReworkMatching: ComplianceQueued }>(QUEUE_MATCHING, {
              ...filterVariables(processing.matching),
              expected: processing.scope.titles,
              fingerprint: processing.fingerprint,
            })
          ).queueReworkMatching
        : (await gql<{ queueRework: ComplianceQueued }>(QUEUE_ITEMS, { items: processing.items })).queueRework;
      onQueued(r, processing);
    } catch (e) {
      onFailed(e);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={label}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            cancel
          </Button>
          <Button
            variant={deletesOriginals(processing.settings) ? 'danger' : 'primary'}
            size="sm"
            leading={<FileVideo size={13} />}
            loading={busy}
            onClick={() => void submit()}
          >
            {label}
          </Button>
        </>
      }
    >
      <div className="kat__form">
        <p className="kat__confirm-body">{confirmBody(processing.scope.titles, processing.settings)}</p>
        {facts.length > 0 && (
          <dl className="kat__kv kat__confirm-facts">
            {facts.map((f) => (
              <Fragment key={f.label}>
                <dt>{f.label}</dt>
                <dd className="kat__mono">{f.value}</dd>
              </Fragment>
            ))}
          </dl>
        )}
      </div>
    </Modal>
  );
}
