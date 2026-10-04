import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Modal, Select, Spinner, Table, Text } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { useQuery } from '../lib/useQuery';
import { useGql } from '../lib/gql';
import { useCatalogStream, debounced } from '../lib/stream';
import { BASE_NOSLASH } from '../lib/basepath';
import { fmtTime } from './status';
import {
  attemptsText,
  catalogItemHref,
  failedTitle,
  policyText,
  retryState,
  stepLabel,
  stepOptions,
  stepTotal,
  timeoutText,
  type StepCounts,
} from './processing';

interface FailedStep {
  itemId: string;
  itemTitle: string;
  itemType: string;
  seriesTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  step: string;
  failures: number;
  lastError: string | null;
  failedAt: string | null;
  nextRetryAt: string | null;
}
interface RetryPolicy {
  available: boolean;
  automatic: boolean;
  reason: string | null;
  maxAttempts: number;
  backoffSeconds: number;
  backoffMaxSeconds: number;
  intervalSeconds: number;
}
interface Overview {
  steps: StepCounts[];
  failed: FailedStep[];
  failedTotal: number;
  retry: RetryPolicy;
}

const LIMIT = 100;

const OVERVIEW_Q = `query Processing($step: String, $limit: Int) {
  processingOverview(step: $step, limit: $limit) {
    steps { step pending inProgress done failed skipped notApplicable retrying stalled timeoutSeconds }
    failed { itemId itemTitle itemType seriesTitle seasonNumber episodeNumber step failures lastError failedAt nextRetryAt }
    failedTotal
    retry { available automatic reason maxAttempts backoffSeconds backoffMaxSeconds intervalSeconds }
  }
}`;
const RETRY_STEP = `mutation($i:ID!,$s:String!){ retryStep(itemId:$i, step:$s){ retried status message } }`;
const RETRY_FAILED = `mutation($s:String){ retryFailed(step:$s){ retried items notSent message } }`;

// A fallback poll only: the catalog stream refreshes the view as the
// pipeline moves.
const POLL_MS = 30_000;

// ProcessingView is what the pipeline holds, step by step, and the steps
// that failed, each with its last error and attempts, retried one at a time
// or all at once.
export function ProcessingView() {
  const gql = useGql();
  const [step, setStep] = useState('');
  const { data, loading, error, refetch } = useQuery<{ processingOverview: Overview }>(
    OVERVIEW_Q,
    { step: step || null, limit: LIMIT },
    [step],
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useMemo(() => debounced(refetch, 2000), [refetch]);
  useCatalogStream(refresh);
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      refetch();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refetch]);

  const o = data?.processingOverview;
  const canRetry = !!o?.retry.available;

  async function retryOne(f: FailedStep) {
    const key = `${f.itemId}/${f.step}`;
    setBusy(key);
    setMsg(null);
    try {
      const d = await gql<{ retryStep: { retried: boolean; message: string } }>(RETRY_STEP, { i: f.itemId, s: f.step });
      setMsg({ ok: d.retryStep.retried, text: `${failedTitle(f)}: ${d.retryStep.message}` });
      refetch();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function retryAll() {
    setBusy('all');
    setMsg(null);
    try {
      const d = await gql<{ retryFailed: { retried: number; notSent: number; message: string } }>(RETRY_FAILED, { s: step || null });
      setMsg({ ok: d.retryFailed.notSent === 0, text: d.retryFailed.message });
      setConfirmAll(false);
      refetch();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      setConfirmAll(false);
    } finally {
      setBusy(null);
    }
  }

  const num = (n: number) => (n ? n : <span className="kat__muted">0</span>);
  const countCols: TableColumn<StepCounts>[] = [
    { key: 'step', header: 'Step', render: (r) => stepLabel(r.step) },
    { key: 'pending', header: 'Pending', align: 'right', render: (r) => num(r.pending) },
    { key: 'inProgress', header: 'Running', align: 'right', render: (r) => num(r.inProgress) },
    { key: 'done', header: 'Done', align: 'right', render: (r) => num(r.done) },
    {
      key: 'failed',
      header: 'Failed',
      align: 'right',
      render: (r) => (r.failed ? <span className="kat__err-num">{r.failed}</span> : num(0)),
    },
    { key: 'retrying', header: 'Retrying', align: 'right', render: (r) => num(r.retrying) },
    { key: 'stalled', header: 'Stalled', align: 'right', render: (r) => num(r.stalled) },
    { key: 'skipped', header: 'Skipped', align: 'right', render: (r) => num(r.skipped) },
    { key: 'notApplicable', header: 'N/A', align: 'right', render: (r) => num(r.notApplicable) },
    { key: 'timeoutSeconds', header: 'Timeout', align: 'right', render: (r) => <span className="kat__mono">{timeoutText(r.timeoutSeconds)}</span> },
  ];

  const failedCols: TableColumn<FailedStep>[] = [
    {
      key: 'itemTitle',
      header: 'Title',
      render: (r) => (
        <a className="kat__rowlink" href={catalogItemHref(BASE_NOSLASH, r.itemId)}>
          {failedTitle(r)}
        </a>
      ),
    },
    { key: 'step', header: 'Step', render: (r) => stepLabel(r.step) },
    {
      key: 'failures',
      header: 'Attempts',
      align: 'right',
      render: (r) => <span className="kat__mono">{attemptsText(r.failures, o?.retry.maxAttempts)}</span>,
    },
    {
      key: 'lastError',
      header: 'Last Error',
      render: (r) =>
        r.lastError ? (
          <span className="kat__err kat__clip" title={r.lastError}>
            {r.lastError}
          </span>
        ) : (
          <span className="kat__muted">no error given</span>
        ),
    },
    { key: 'failedAt', header: 'Failed', render: (r) => fmtTime(r.failedAt) },
    {
      key: 'nextRetryAt',
      header: 'Next Retry',
      render: (r) => <Badge tone={r.nextRetryAt ? 'blue' : 'neutral'}>{retryState({ status: 'failed', ...r }, o?.retry.maxAttempts, now)}</Badge>,
    },
    {
      key: 'itemId',
      header: '',
      align: 'right',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          leading={<RotateCcw size={13} />}
          disabled={!canRetry}
          loading={busy === `${r.itemId}/${r.step}`}
          onClick={() => void retryOne(r)}
        >
          Retry
        </Button>
      ),
    },
  ];

  const total = o?.failedTotal ?? 0;
  const of = step ? ` ${stepLabel(step)}` : '';

  return (
    <div>
      <div className="kat__toolbar">
        <Field label="Step">
          <Select value={step} onChange={(e) => setStep(e.target.value)} options={stepOptions()} />
        </Field>
        <span className="kat__spacer" />
        <Button
          leading={<RotateCcw size={15} />}
          disabled={!canRetry || total === 0}
          loading={busy === 'all'}
          onClick={() => setConfirmAll(true)}
        >
          Retry All Failed
        </Button>
        <Button variant="ghost" size="sm" leading={<RefreshCw size={14} />} onClick={refetch}>
          Refresh
        </Button>
      </div>
      {o && <div className={o.retry.available ? 'kat__muted kat__policy' : 'kat__err'}>{policyText(o.retry)}</div>}
      {msg && <div className={msg.ok ? 'kat__ok kat__mono' : 'kat__err'}>{msg.text}</div>}
      {error && <div className="kat__err">error: {error}</div>}

      {loading && !o ? (
        <div className="kat__state">
          <Spinner /> <Text variant="muted">loading processing…</Text>
        </div>
      ) : o ? (
        <>
          <Table
            columns={countCols}
            rows={o.steps.filter((c) => c.step === step || stepTotal(c) > 0)}
            rowKey={(r) => r.step}
            dense
            empty={<Text variant="muted">no steps.</Text>}
          />
          <div className="kat__section">
            <Text variant="ui">
              failed{of} · {total}
            </Text>
            {total > o.failed.length && (
              <Text variant="dim">
                showing the latest {o.failed.length} of {total}
              </Text>
            )}
          </div>
          <Table
            columns={failedCols}
            rows={o.failed}
            rowKey={(r) => `${r.itemId}/${r.step}`}
            dense
            empty={<Text variant="muted">nothing failed{of ? ` in${of.toLowerCase()}` : ''}.</Text>}
          />
        </>
      ) : null}

      {confirmAll && (
        <Modal
          open
          onClose={() => setConfirmAll(false)}
          title="Retry All Failed"
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmAll(false)}>
                Cancel
              </Button>
              <Button size="sm" leading={<RotateCcw size={13} />} loading={busy === 'all'} onClick={() => void retryAll()}>
                Retry {total}
              </Button>
            </>
          }
        >
          <div className="kat__form">
            <Text variant="muted">
              sends the {total} failed{of.toLowerCase()} {total === 1 ? 'step' : 'steps'} to their workers again. each
              starts a fresh run of attempts; a step a worker is still running is left alone.
            </Text>
          </div>
        </Modal>
      )}
    </div>
  );
}
