import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Badge, Button, Checkbox, Field, Heading, Input, Modal, Select, Spinner, Table, Text } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import { AlertTriangle, Check, CheckCircle2, CircleHelp, FileVideo, Info, RefreshCw, Search, SearchX } from 'lucide-react';
import { useGql } from '../lib/gql';
import { useQuery } from '../lib/useQuery';
import { BASE_NOSLASH } from '../lib/basepath';
import { fmtTime } from './status';
import { catalogItemHref } from './processing';
import {
  CLEARED_FILTER,
  DEFAULT_FILTER,
  KIND_OPTIONS,
  NO_SELECTION,
  RULE_ORDER,
  announceText,
  appendRows,
  checkState,
  confirmBody,
  confirmFacts,
  countText,
  emptyState,
  filterKey,
  filterVariables,
  findingText,
  fmtCount,
  hiddenCount,
  inQueue,
  inRuleOrder,
  isFiltering,
  isOnlyRule,
  isSelected,
  loadFailure,
  matchingScope,
  notQueuedBanner,
  offersMatching,
  outcomeLine,
  pageState,
  pickRule,
  pollMs,
  processLabel,
  queueParts,
  queuedToasts,
  rowDetails,
  rowStatus,
  rowTitle,
  rowsScope,
  ruleLabel,
  ruleOption,
  select,
  selectedCount,
  selectionText,
  sizeText,
  staleText,
  titlesOf,
  withRule,
  workerName,
  type ComplianceFilter,
  type ComplianceKind,
  type ComplianceQueued,
  type ComplianceReport,
  type ComplianceRow,
  type ComplianceRule,
  type ComplianceSummary,
  type ProcessScope,
  type WorkerRules,
} from './compliance';

// katalog-manager answers a page of this many titles at a time.
const PAGE = 100;

const REPORT_Q = `query Rules($kind: ComplianceKind, $rules: [ComplianceRule!], $search: String, $first: Int, $after: String) {
  libraryCompliance(kind: $kind, rules: $rules, search: $search, first: $first, after: $after) {
    rules {
      transcoder { worker version reportedAt rules { key label value detail } }
      packager { worker version reportedAt rules { key label value detail } }
    }
    notEvaluated evaluatedAt evaluating
    matching { titles originalBytes packageBytes estimatedBytes }
    queueable { titles originalBytes packageBytes estimatedBytes }
    queue { queued processing processed failed }
    summary { rule titles packageBytes estimatedBytes }
    rows {
      itemId title year kind seriesId seriesTitle season episode
      findings { rule text measured limit detail }
      originalBytes packageBytes estimatedBytes queue queueReason queueDetail evaluatedAt
    }
    nextCursor
  }
}`;
// Every title that breaks a rule, whatever the filter: the filter bar's
// "230 of 279".
const ALL_Q = `query RulesAll { libraryCompliance(first: 1) { matching { titles } } }`;
const QUEUED = `queued alreadyQueued skipped skippedTitles { itemId title reason } message queuedText alreadyText notQueuedText`;
const QUEUE_ITEMS = `mutation($items: [ID!]!) { queueRework(items: $items) { ${QUEUED} } }`;
const QUEUE_MATCHING = `mutation($kind: ComplianceKind, $rules: [ComplianceRule!], $search: String) {
  queueReworkMatching(kind: $kind, rules: $rules, search: $search) { ${QUEUED} }
}`;
const CHECK = `mutation($kind: ComplianceKind) { refreshCompliance(kind: $kind) }`;

/** Titles the confirm asks about: those named, or every title that matches
 *  the filter. */
interface Processing {
  scope: ProcessScope;
  items: string[];
  matching: ComplianceFilter | null;
  // from the selection toolbar: once queued, the selection is cleared
  bulk: boolean;
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

// useReport reads the report a page at a time: a change of the filter reads
// it afresh from the top, "show more" adds the next page, and a refresh
// reads as many rows again as are shown, so people keep their place and the
// rows' statuses are current. A response for a filter changed since is
// dropped.
function useReport(filter: ComplianceFilter) {
  const gql = useGql();
  const key = filterKey(filter);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState<Reading | null>('first');
  const seq = useRef(0);
  const at = useRef({ vars: filterVariables(filter), rows: [] as ComplianceRow[], cursor: null as string | null, busy: false });
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
      const d = await gqlRef.current<{ libraryCompliance: ComplianceReport }>(REPORT_Q, {
        ...s.vars,
        first,
        after: how === 'more' ? s.cursor : null,
      });
      if (id !== seq.current) return;
      const r = d.libraryCompliance;
      s.rows = how === 'more' ? appendRows(s.rows, r.rows) : r.rows;
      s.cursor = r.nextCursor;
      setReport(r);
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
    at.current.vars = filterVariables(filter);
    at.current.cursor = null;
    void read('first');
    return () => {
      seq.current++;
      at.current.busy = false;
    };
    // the filter is read again only when it asks for other titles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, read]);

  const refresh = useCallback(() => void read('refresh'), [read]);
  const more = useCallback(() => void read('more'), [read]);
  // a poll leaves a read under way alone
  const poll = useCallback(() => {
    if (!at.current.busy) void read('refresh');
  }, [read]);
  return { report, rows, error, loadedAt, loading, refresh, more, poll };
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

// RulesView is the titles that break the rules the transcoder and the
// packager report: the rules, how many titles break each and the queue's
// progress, and the titles, processed again one at a time, by a selection or
// every one that matches, through the re-encode queue.
export function RulesView() {
  const gql = useGql();
  const [kind, setKind] = useState<ComplianceKind | ''>(DEFAULT_FILTER.kind);
  const [rules, setRules] = useState<ComplianceRule[]>(DEFAULT_FILTER.rules);
  const [typed, setTyped] = useState('');
  const search = useDebounced(typed, 300);
  const filter = useMemo<ComplianceFilter>(() => ({ kind, rules, search }), [kind, rules, search]);
  const key = filterKey(filter);
  const { report, rows, error, loadedAt, loading, refresh, more, poll } = useReport(filter);
  const all = useQuery<{ libraryCompliance: { matching: { titles: number } } }>(ALL_Q);
  const [sel, dispatch] = useReducer(select, NO_SELECTION);
  const [processing, setProcessing] = useState<Processing | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [checking, setChecking] = useState(false);
  const toasts = useToasts();
  const toolbar = useRef<HTMLDivElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const barHeight = useBarHeight();

  // a change of the filter keeps the ticked rows; every match of another
  // filter is no selection any more
  useEffect(() => {
    dispatch({ type: 'filter', key });
  }, [key]);
  // rows read again: ticked rows as they are now
  useEffect(() => {
    dispatch({ type: 'loaded', rows });
  }, [rows]);

  // read again by itself while a check runs or the queue holds titles
  const every = pollMs(report, rows);
  useEffect(() => {
    if (!every) return;
    const t = setInterval(poll, every);
    return () => clearInterval(t);
  }, [every, poll]);

  // a read that failed with the list on the screen: a banner says how old it is
  const stale: Problem | null =
    report && error ? { state: 'warning', text: staleText(loadedAt, Date.now()), detail: loadFailure(error).detail, retry: true } : null;

  const refetchAll = all.refetch;
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

  function clearAll() {
    // the button disables itself: the search takes the focus first
    searchField.current?.focus();
    setKind(CLEARED_FILTER.kind);
    setRules(CLEARED_FILTER.rules);
    setTyped(CLEARED_FILTER.search);
  }

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
  // what "select all" ticks and queues: the matches the queue doesn't hold
  const queueable = report.queueable.titles;
  const count = selectedCount(sel, queueable);
  const hidden = hiddenCount(sel, rows);
  const headBox = pageState(sel, rows);
  const pickable = rows.filter((r) => !inQueue(r.queue));
  const empty = emptyState(report, filter);
  const capsChecked = report.rules.transcoder != null;

  const open = (p: Processing) => setProcessing(p);
  function processSelection() {
    if (!report) return;
    if (sel.mode === 'matching') {
      open({ scope: matchingScope(report.queueable), items: [], matching: filter, bulk: true });
      return;
    }
    open({ scope: rowsScope(sel.rows), items: sel.rows.map((r) => r.itemId), matching: null, bulk: true });
  }

  const cols: TableColumn<ComplianceRow>[] = [
    {
      key: 'itemId',
      header: (
        <Checkbox
          aria-label="select every visible row"
          checked={headBox === 'all'}
          indeterminate={headBox === 'some'}
          disabled={pickable.length === 0}
          onChange={(e) => dispatch({ type: 'page', on: e.target.checked, rows })}
        />
      ),
      width: 28,
      render: (r) => (
        <Checkbox
          aria-label={`select ${rowTitle(r)}`}
          checked={isSelected(sel, r)}
          disabled={inQueue(r.queue)}
          onChange={(e) => dispatch({ type: 'row', row: r, on: e.target.checked, loaded: rows })}
        />
      ),
    },
    {
      key: 'title',
      header: 'title',
      render: (r) => (
        <a className="kat__rowlink kat__cell-title" href={catalogItemHref(BASE_NOSLASH, r.itemId)}>
          {rowTitle(r)}
        </a>
      ),
    },
    {
      key: 'findings',
      header: 'findings',
      render: (r) => {
        const outcome = outcomeLine(r, capsChecked);
        const details = rowDetails(r);
        return (
          <div className="kat__findings">
            <ul>
              {r.findings.map((f, i) => (
                <li key={`${f.rule}/${i}`}>{findingText(f)}</li>
              ))}
            </ul>
            {outcome && <span className="kat__outcome">{outcome}</span>}
            {details.length > 0 && <Details detail={details.join('\n')} of={rowTitle(r)} />}
          </div>
        );
      },
    },
    { key: 'originalBytes', header: 'original', align: 'right', render: (r) => <span className="kat__nowrap">{sizeText(r.originalBytes)}</span> },
    {
      key: 'packageBytes',
      header: 'package',
      align: 'right',
      render: (r) => <span className="kat__nowrap">{sizeText(r.packageBytes)}</span>,
    },
    {
      key: 'queue',
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
      key: 'evaluatedAt',
      header: '',
      align: 'right',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          leading={<FileVideo size={13} />}
          disabled={inQueue(r.queue)}
          aria-label={`process again: ${rowTitle(r)}`}
          onClick={() => open({ scope: rowsScope([r]), items: [r.itemId], matching: null, bulk: false })}
        >
          process again
        </Button>
      ),
    },
  ];

  const parts = queueParts(report.queue);
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
      <RulesPanel report={report} checking={checking} onCheck={() => void checkAgain()} />
      {banners}

      {report.summary.length > 0 && (
        <div className="kat__summary">
          <h3 className="kat__h3">by rule</h3>
          <ScrollEdges>
            <SummaryTable summary={report.summary} rules={rules} onPick={(rule) => setRules(pickRule(rules, rule))} />
          </ScrollEdges>
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
              {countText(matching, all.data?.libraryCompliance.matching.titles)}
            </span>
            <Button variant="ghost" size="sm" disabled={!isFiltering({ kind, rules, search: typed })} onClick={clearAll}>
              clear all
            </Button>
          </div>
        </div>
        <fieldset className="kat__rulepick">
          <legend>rules</legend>
          <div className="kat__rulepick-list">
            {RULE_ORDER.map((rule) => (
              <Checkbox
                key={rule}
                label={ruleOption(rule)}
                checked={rules.includes(rule)}
                onChange={(e) => setRules(withRule(rules, rule, e.target.checked))}
              />
            ))}
          </div>
        </fieldset>
      </div>

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
            offer={offersMatching(sel, rows, queueable) ? `select all ${fmtCount(queueable)} matching` : null}
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
          <ScrollEdges>
            <Table columns={cols} rows={rows} rowKey={(r) => r.itemId} dense aria-label="titles" />
          </ScrollEdges>
        </>
      )}
      {rows.length > 0 && rows.length < matching && (
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

      <Toaster items={toasts.items} onGone={toasts.gone} />
      {processing && <ProcessDialog processing={processing} onClose={close} onQueued={queued} onFailed={failed} />}
    </section>
  );
}

// RulesPanel is the rules each worker reported, and when the titles were
// checked, checked again on asking.
function RulesPanel({ report, checking, onCheck }: { report: ComplianceReport; checking: boolean; onCheck: () => void }) {
  const state = checkState(report);
  return (
    <div className="kat__panel kat__rules-panel">
      <div className="kat__workers">
        <WorkerBlock slot="transcoder" w={report.rules.transcoder} />
        <WorkerBlock slot="packager" w={report.rules.packager} />
      </div>
      {state !== 'never' && (
        <div className="kat__checked">
          {state === 'checking' && <Spinner size={12} />}
          <Text variant="muted">{state === 'checking' ? 'Checking the titles…' : `Checked ${fmtTime(report.evaluatedAt)}`}</Text>
          <Button variant="ghost" size="sm" leading={<RefreshCw size={14} />} loading={checking} disabled={state === 'checking'} onClick={onCheck}>
            check again
          </Button>
        </div>
      )}
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

// SummaryTable is how many titles break each rule and their packages now and
// at most after; a rule lists its titles alone, and again every rule's.
function SummaryTable({
  summary,
  rules,
  onPick,
}: {
  summary: ComplianceSummary[];
  rules: ComplianceRule[];
  onPick: (rule: ComplianceRule) => void;
}) {
  const cols: TableColumn<ComplianceSummary>[] = [
    {
      key: 'rule',
      header: 'rule',
      render: (s) => (
        <button type="button" className="kat__rulebtn" aria-pressed={isOnlyRule(rules, s.rule)} onClick={() => onPick(s.rule)}>
          {ruleLabel(s.rule)}
        </button>
      ),
    },
    { key: 'titles', header: 'titles', align: 'right', render: (s) => (s.titles ? fmtCount(s.titles) : <span className="kat__muted">0</span>) },
    { key: 'packageBytes', header: 'now', align: 'right', render: (s) => <span className="kat__nowrap">{sizeText(s.packageBytes)}</span> },
    {
      key: 'estimatedBytes',
      header: 'at most after',
      align: 'right',
      render: (s) => <span className="kat__nowrap">{sizeText(s.estimatedBytes)}</span>,
    },
  ];
  return <Table columns={cols} rows={inRuleOrder(summary)} rowKey={(s) => s.rule} dense aria-label="titles by rule" />;
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
// screen, and fades the edge it goes on past, so people see there is more.
function ScrollEdges({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<'' | 'left' | 'right' | 'both'>('');
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.nc-table__scroll');
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore(left && right ? 'both' : left ? 'left' : right ? 'right' : '');
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
    <div ref={box} className="kat__hscroll" data-more={more || undefined}>
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
// again does, and their packages now and at most after.
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
        ? (await gql<{ queueReworkMatching: ComplianceQueued }>(QUEUE_MATCHING, filterVariables(processing.matching))).queueReworkMatching
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
          <Button variant="primary" size="sm" leading={<FileVideo size={13} />} loading={busy} onClick={() => void submit()}>
            {label}
          </Button>
        </>
      }
    >
      <div className="kat__form">
        <p className="kat__confirm-body">{confirmBody(processing.scope.titles)}</p>
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
