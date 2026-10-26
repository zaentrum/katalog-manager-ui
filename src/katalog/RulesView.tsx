import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Spinner, Table, Text } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import { CheckCircle2, FileVideo, Info, RefreshCw, Search } from 'lucide-react';
import { useGql } from '../lib/gql';
import { useQuery } from '../lib/useQuery';
import { BASE_NOSLASH } from '../lib/basepath';
import { fmtTime } from './status';
import { catalogItemHref } from './processing';
import {
  DEFAULT_FILTER,
  KIND_OPTIONS,
  NO_SELECTION,
  RULE_ORDER,
  appendRows,
  checkState,
  emptyText,
  filterKey,
  filterVariables,
  findingText,
  inQueue,
  inRuleOrder,
  isOnlyRule,
  isSelected,
  matchingScope,
  notCheckedHere,
  offersMatching,
  pageState,
  pickRule,
  pollMs,
  queueFacts,
  queueTone,
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
  type ComplianceKind,
  type ComplianceQueued,
  type ComplianceReport,
  type ComplianceRow,
  type ComplianceRule,
  type ComplianceSummary,
  type QueueFacts,
  type ReworkScope,
  type WorkerRules,
} from './compliance';

// katalog-manager answers a page of this many titles at a time.
const PAGE = 100;

const REPORT_Q = `query Rules($kind: ComplianceKind, $rules: [ComplianceRule!], $search: String, $first: Int, $after: String) {
  libraryCompliance(kind: $kind, rules: $rules, search: $search, first: $first, after: $after) {
    rules {
      transcoder { worker version reportedAt rules { key label value } }
      packager { worker version reportedAt rules { key label value } }
    }
    notEvaluated evaluatedAt evaluating total
    summary { rule titles packageBytes estimatedBytes }
    rows {
      itemId title year kind seriesId seriesTitle season episode
      findings { rule text measured limit }
      originalBytes packageBytes estimatedBytes queue evaluatedAt
    }
    nextCursor
  }
}`;
const QUEUE_ITEMS = `mutation($items: [ID!]!) { queueRework(items: $items) { queued alreadyQueued skipped message } }`;
const QUEUE_MATCHING = `mutation($kind: ComplianceKind, $rules: [ComplianceRule!], $search: String) {
  queueReworkMatching(kind: $kind, rules: $rules, search: $search) { queued alreadyQueued skipped message }
}`;
const CHECK = `mutation($kind: ComplianceKind) { refreshCompliance(kind: $kind) }`;
// The sizes of every title that matches, a page at a time, for the confirm
// of a rework of them all when more match than are loaded. Past SIZE_PAGES
// pages it says no sizes rather than some.
const SIZES_Q = `query RuleSizes($kind: ComplianceKind, $rules: [ComplianceRule!], $search: String, $first: Int, $after: String) {
  libraryCompliance(kind: $kind, rules: $rules, search: $search, first: $first, after: $after) {
    rows { packageBytes estimatedBytes }
    nextCursor
  }
}`;
const SIZE_PAGE = 500;
const SIZE_PAGES = 40;
// The re-encode queue's pace and what it holds, asked apart from the report:
// the settings it is sent by, how often katalog-manager's sweep runs, and the
// queue's counts. The confirm says what of them it could read.
const PACE_Q = `{ settings { key valueText } retryPolicy { intervalSeconds } }`;
const QUEUE_Q = `{ processingOverview(limit: 1) { reencodeQueue { queued sent idle } } }`;

/** A rework the confirm asks about: the titles named, or every title that
 *  matches the filter. */
interface Rework {
  scope: ReworkScope;
  items: string[];
  matching: ComplianceFilter | null;
  // from the selection's bar: once queued, the selection is cleared
  bulk: boolean;
}

type Reading = 'first' | 'more' | 'refresh';

// useReport reads the report a page at a time: a change of the filter reads
// it afresh, "show more" adds the next page, and a refresh reads as many rows
// again as are shown, so their place in the queue is current. A response for
// a filter changed since is dropped.
function useReport(filter: ComplianceFilter) {
  const gql = useGql();
  const key = filterKey(filter);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
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
  return { report, rows, error, loading, refresh, more, poll };
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

// RulesView is the titles that break the rules the pipeline's workers
// report: the rules, how many titles break each, and the titles, reworked
// one at a time, by a selection or every one that matches, through the
// re-encode queue.
export function RulesView() {
  const gql = useGql();
  const [kind, setKind] = useState<ComplianceKind | ''>(DEFAULT_FILTER.kind);
  const [rules, setRules] = useState<ComplianceRule[]>(DEFAULT_FILTER.rules);
  const [typed, setTyped] = useState('');
  const search = useDebounced(typed, 300);
  const filter = useMemo<ComplianceFilter>(() => ({ kind, rules, search }), [kind, rules, search]);
  const key = filterKey(filter);
  const { report, rows, error, loading, refresh, more, poll } = useReport(filter);
  const [sel, dispatch] = useReducer(select, NO_SELECTION);
  const [rework, setRework] = useState<Rework | null>(null);
  const [result, setResult] = useState<ComplianceQueued | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const pace = useQuery<{ settings: { key: string; valueText: string | null }[]; retryPolicy: { intervalSeconds: number } }>(PACE_Q);
  const queue = useQuery<{ processingOverview: { reencodeQueue: { queued: number; sent: number; idle: string | null } | null } }>(QUEUE_Q);
  const facts: QueueFacts = queueFacts(
    pace.data?.settings,
    pace.data?.retryPolicy.intervalSeconds,
    queue.data?.processingOverview.reencodeQueue,
  );

  // a change of the filter clears the selection
  useEffect(() => {
    dispatch({ type: 'clear' });
  }, [key]);
  // the rows that can be ticked: none the queue holds already
  const selectable = useMemo(() => rows.filter((r) => !inQueue(r.queue)).map((r) => r.itemId), [rows]);
  // after a refresh only the rows still listed stay ticked
  useEffect(() => {
    dispatch({ type: 'keep', loaded: selectable });
  }, [selectable]);

  // read again by itself while a check runs or a title listed is in the queue
  const every = pollMs(report, rows);
  useEffect(() => {
    if (!every) return;
    const t = setInterval(poll, every);
    return () => clearInterval(t);
  }, [every, poll]);

  const refetchPace = pace.refetch;
  const refetchQueue = queue.refetch;
  const open = useCallback(
    (w: Rework) => {
      // the queue's pace and counts as they are now
      refetchPace();
      refetchQueue();
      setRework(w);
    },
    [refetchPace, refetchQueue],
  );
  // stable: the dialog would take its focus back to its first control on
  // every render of the tab otherwise
  const close = useCallback(() => setRework(null), []);
  const queued = useCallback(
    (r: ComplianceQueued, w: Rework) => {
      setRework(null);
      setResult(r);
      if (w.bulk) dispatch({ type: 'clear' });
      refresh();
      refetchQueue();
    },
    [refresh, refetchQueue],
  );

  async function checkAgain() {
    setChecking(true);
    setCheckErr(null);
    try {
      await gql<{ refreshCompliance: boolean }>(CHECK, { kind: filter.kind || null });
    } catch (e) {
      setCheckErr(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
      refresh();
    }
  }

  if (notCheckedHere(error)) {
    return (
      <div className="kat__state">
        <Info size={16} className="kat__muted" aria-hidden />
        <Text variant="muted">this catalog does not check its rules yet.</Text>
      </div>
    );
  }
  if (!report) {
    if (error) {
      return (
        <div className="kat__state">
          <span className="kat__err">error: {error}</span>
          <Button variant="ghost" size="sm" leading={<RefreshCw size={14} />} onClick={refresh}>
            try again
          </Button>
        </div>
      );
    }
    return (
      <div className="kat__state">
        <Spinner /> <Text variant="muted">loading rules…</Text>
      </div>
    );
  }

  const total = report.total;
  const count = selectedCount(sel, total);
  const head = pageState(sel, selectable);
  const empty = emptyText(report, filter);

  function reworkSelection() {
    if (!report) return;
    if (sel.mode === 'matching') {
      open({ scope: matchingScope(report, filter, rows), items: [], matching: filter, bulk: true });
      return;
    }
    const chosen = rows.filter((r) => isSelected(sel, r.itemId));
    open({ scope: rowsScope(chosen), items: chosen.map((r) => r.itemId), matching: null, bulk: true });
  }

  const cols: TableColumn<ComplianceRow>[] = [
    {
      key: 'itemId',
      header: (
        <Checkbox
          aria-label="select every title shown"
          checked={head === 'all'}
          indeterminate={head === 'some'}
          disabled={selectable.length === 0}
          onChange={(e) => dispatch({ type: 'page', on: e.target.checked, loaded: selectable })}
        />
      ),
      width: 28,
      render: (r) => (
        <Checkbox
          aria-label={`select ${rowTitle(r)}`}
          checked={!inQueue(r.queue) && isSelected(sel, r.itemId)}
          disabled={inQueue(r.queue)}
          onChange={(e) => dispatch({ type: 'row', id: r.itemId, on: e.target.checked, loaded: selectable })}
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
      render: (r) => (
        <ul className="kat__findings">
          {r.findings.map((f, i) => (
            <li key={`${f.rule}/${i}`}>{findingText(f)}</li>
          ))}
        </ul>
      ),
    },
    { key: 'originalBytes', header: 'original', align: 'right', render: (r) => <span className="kat__nowrap">{sizeText(r.originalBytes)}</span> },
    {
      key: 'packageBytes',
      header: 'package',
      align: 'right',
      render: (r) => <span className="kat__nowrap">{sizeChange(r.packageBytes, r.estimatedBytes)}</span>,
    },
    {
      key: 'queue',
      header: 'queue',
      render: (r) =>
        r.queue ? (
          <Badge tone={queueTone(r.queue)} dot={r.queue === 'sent'}>
            {queueWord(r.queue)}
          </Badge>
        ) : (
          <span className="kat__muted">—</span>
        ),
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
          aria-label={`rework ${rowTitle(r)}`}
          onClick={() => open({ scope: rowsScope([r]), items: [r.itemId], matching: null, bulk: false })}
        >
          rework
        </Button>
      ),
    },
  ];

  return (
    <div>
      <RulesPanel report={report} checking={checking} error={checkErr} onCheck={() => void checkAgain()} />

      {report.summary.length > 0 && (
        <>
          <div className="kat__section">
            <Text variant="ui">by rule</Text>
          </div>
          <div className="kat__summary">
            <SummaryTable summary={report.summary} rules={rules} onPick={(rule) => setRules(pickRule(rules, rule))} />
          </div>
        </>
      )}

      <div className="kat__filters">
        <Field label="type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ComplianceKind | '')} options={KIND_OPTIONS} />
        </Field>
        <Field label="search">
          <Input placeholder="title…" value={typed} leading={<Search size={14} />} onChange={(e) => setTyped(e.target.value)} />
        </Field>
        <div className="kat__spacer" />
        {loading === 'first' && <Spinner size={14} label="loading titles" />}
        <Text variant="dim">
          {total} {total === 1 ? 'title' : 'titles'}
        </Text>
      </div>
      <fieldset className="kat__rulepick">
        <legend>rules</legend>
        <div className="kat__rulepick-list">
          {RULE_ORDER.map((rule) => (
            <Checkbox
              key={rule}
              label={ruleLabel(rule)}
              checked={rules.includes(rule)}
              onChange={(e) => setRules(withRule(rules, rule, e.target.checked))}
            />
          ))}
        </div>
      </fieldset>

      {error && <div className="kat__err">error: {error}</div>}
      {rows.length === 0 ? (
        // not while the titles of a filter changed are on their way
        empty &&
        loading !== 'first' && (
          <div className="kat__state">
            <CheckCircle2 size={16} className="kat__muted" aria-hidden />
            <Text variant="muted">{empty}</Text>
          </div>
        )
      ) : (
        <Table columns={cols} rows={rows} rowKey={(r) => r.itemId} dense />
      )}
      {rows.length > 0 && rows.length < total && (
        <div className="kat__more">
          <Text variant="dim">
            {rows.length} of {total} shown
          </Text>
          {report.nextCursor && (
            <Button variant="ghost" size="sm" loading={loading === 'more'} onClick={more}>
              show more
            </Button>
          )}
        </div>
      )}

      {(count > 0 || result) && (
        <div className="kat__dock">
          {result && <Queued result={result} onDismiss={() => setResult(null)} />}
          {count > 0 && (
            <div className="kat__bulk" role="region" aria-label="selected titles">
              <Text variant="ui" aria-live="polite">
                {selectionText(sel, total)}
              </Text>
              {offersMatching(sel, selectable, rows.length, total) && (
                <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'matching' })}>
                  select all {total} matching
                </Button>
              )}
              <span className="kat__spacer" />
              <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'clear' })}>
                clear selection
              </Button>
              <Button size="sm" leading={<FileVideo size={13} />} onClick={reworkSelection}>
                rework {count}
              </Button>
            </div>
          )}
        </div>
      )}

      {rework && <ReworkDialog rework={rework} facts={facts} onClose={close} onQueued={queued} />}
    </div>
  );
}

// RulesPanel is the rules each worker reported, what the report could not
// check, and when the titles were checked, checked again on asking.
function RulesPanel({
  report,
  checking,
  error,
  onCheck,
}: {
  report: ComplianceReport;
  checking: boolean;
  error: string | null;
  onCheck: () => void;
}) {
  const state = checkState(report);
  return (
    <section className="kat__panel kat__rules" aria-label="the pipeline’s rules">
      <div className="kat__workers">
        <WorkerBlock slot="transcoder" w={report.rules.transcoder} />
        <WorkerBlock slot="packager" w={report.rules.packager} />
      </div>
      {report.notEvaluated.map((line) => (
        <div key={line} className="kat__err">
          {line}
        </div>
      ))}
      <div className="kat__checked">
        {state === 'checking' && <Spinner size={12} />}
        <Text variant="muted">
          {state === 'checking'
            ? 'checking the titles…'
            : state === 'checked'
              ? `checked ${fmtTime(report.evaluatedAt)}`
              : 'the titles have not been checked.'}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          leading={<RefreshCw size={14} />}
          loading={checking}
          disabled={state === 'checking'}
          onClick={onCheck}
        >
          {state === 'never' ? 'check the titles' : 'check again'}
        </Button>
        {error && <span className="kat__err">{error}</span>}
      </div>
    </section>
  );
}

// WorkerBlock is what one worker reported of its rules, each setting by the
// worker's own label, and when it reported; or that it never did.
function WorkerBlock({ slot, w }: { slot: string; w: WorkerRules | null }) {
  return (
    <div className="kat__worker">
      <div className="kat__worker-head">
        <Text as="h2" variant="ui">
          {w ? workerName(slot, w) : slot}
        </Text>
        {w?.version && <span className="kat__mono kat__muted">{w.version}</span>}
        {w ? <Text variant="dim">reported {fmtTime(w.reportedAt)}</Text> : <Badge tone="amber">not reported</Badge>}
      </div>
      {w &&
        (w.rules.length ? (
          <dl className="kat__kv">
            {w.rules.map((r) => (
              <Fragment key={r.key}>
                <dt>{r.label}</dt>
                <dd className="kat__mono">{r.value}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <Text variant="muted">it reported no rules.</Text>
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
    { key: 'titles', header: 'titles', align: 'right', render: (s) => (s.titles ? s.titles : <span className="kat__muted">0</span>) },
    {
      key: 'packageBytes',
      header: 'packages',
      align: 'right',
      render: (s) => <span className="kat__nowrap">{sizeChange(s.packageBytes, s.estimatedBytes)}</span>,
    },
  ];
  return <Table columns={cols} rows={inRuleOrder(summary)} rowKey={(s) => s.rule} dense />;
}

// Queued says what the last rework queued; it stays until dismissed.
function Queued({ result, onDismiss }: { result: ComplianceQueued; onDismiss: () => void }) {
  return (
    <div className="kat__notice" role="status">
      <FileVideo size={15} aria-hidden />
      <div className="kat__notice-body">
        <Text variant="ui">{queuedCounts(result)}</Text>
        {result.message && <Text variant="muted">{result.message}</Text>}
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        dismiss
      </Button>
    </div>
  );
}

// ReworkDialog asks before titles go to the re-encode queue, the same for one
// title and for many: how many, their sizes now and after, the queue's pace,
// and what plays meanwhile. One that queued none (each skipped) stays open,
// saying why.
function ReworkDialog({
  rework,
  facts,
  onClose,
  onQueued,
}: {
  rework: Rework;
  facts: QueueFacts;
  onClose: () => void;
  onQueued: (r: ComplianceQueued, w: Rework) => void;
}) {
  const gql = useGql();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState(rework.scope);
  // every title that matches, more than are loaded: their sizes are counted
  const [counting, setCounting] = useState(!!rework.matching && rework.scope.packageBytes == null);

  useEffect(() => {
    if (!counting || !rework.matching) return;
    let live = true;
    const vars = filterVariables(rework.matching);
    void (async () => {
      type Sizes = Pick<ComplianceRow, 'packageBytes' | 'estimatedBytes'>;
      const rows: Sizes[] = [];
      let after: string | null = null;
      for (let page = 0; page < SIZE_PAGES; page++) {
        const d = await gql<{ libraryCompliance: { rows: Sizes[]; nextCursor: string | null } }>(SIZES_Q, {
          ...vars,
          first: SIZE_PAGE,
          after,
        });
        rows.push(...d.libraryCompliance.rows);
        after = d.libraryCompliance.nextCursor;
        if (!after || !live) break;
      }
      if (live && !after) setScope((s) => ({ ...s, ...sizesOf(rows) }));
    })()
      .catch(() => {
        /* the sizes go unsaid */
      })
      .finally(() => live && setCounting(false));
    return () => {
      live = false;
    };
    // counted once, when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const r = rework.matching
        ? (await gql<{ queueReworkMatching: ComplianceQueued }>(QUEUE_MATCHING, filterVariables(rework.matching))).queueReworkMatching
        : (await gql<{ queueRework: ComplianceQueued }>(QUEUE_ITEMS, { items: rework.items })).queueRework;
      if (queuedAny(r)) {
        onQueued(r, rework);
        return;
      }
      setErr(r.message || queuedCounts(r));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={reworkTitle(rework.scope)}
      width={560}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            cancel
          </Button>
          <Button size="sm" leading={<FileVideo size={13} />} loading={busy} onClick={() => void submit()}>
            {reworkButton(rework.scope)}
          </Button>
        </>
      }
    >
      <div className="kat__form">
        {reworkText(scope, facts).map((p, i) => (
          <Fragment key={p}>
            <Text variant="muted">{p}</Text>
            {i === 0 && counting && (
              <div className="kat__state kat__counting">
                <Spinner size={12} /> <Text variant="dim">counting their sizes…</Text>
              </div>
            )}
          </Fragment>
        ))}
        {err && <div className="kat__err">{err}</div>}
      </div>
    </Modal>
  );
}
