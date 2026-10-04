import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Spinner, Text } from '@nalet/design-system';
import { RotateCcw } from 'lucide-react';
import { useQuery } from '../lib/useQuery';
import { useGql } from '../lib/gql';
import { useCatalogStream, debounced } from '../lib/stream';
import { fmtTime, statusTone } from './status';
import { ago, canRetry, inPipelineOrder, retryState, stepLabel, type StepRun } from './processing';

// The item's steps with what katalog-manager keeps of their retries. Asked
// apart from the item, so the rest of the item page still reads from a
// katalog-manager older than the retries: the console is released apart
// from it.
const STEPS_Q = `query ItemSteps($id: ID!) {
  item(id: $id) {
    processingSteps {
      step status attempts error startedAt finishedAt updatedAt failures lastError nextRetryAt dispatchedAt
    }
  }
  retryPolicy { available reason maxAttempts }
}`;
const RETRY_STEP = `mutation($i:ID!,$s:String!){ retryStep(itemId:$i, step:$s){ retried status message } }`;

interface Policy {
  available: boolean;
  reason: string | null;
  maxAttempts: number;
}

// What a step's line under its name says: its attempts, when it ran or
// finished, and where its retry stands.
function stepFacts(s: StepRun, maxAttempts: number | null, now: number): string {
  const facts: string[] = [];
  if (s.failures > 0) {
    facts.push(maxAttempts ? `attempt ${s.failures} of ${maxAttempts} failed` : `${s.failures} failed ${s.failures === 1 ? 'attempt' : 'attempts'}`);
  }
  switch (s.status) {
    case 'in_progress':
      facts.push(`running, its worker last reported ${ago(s.updatedAt, now) || 'at an unknown time'}`);
      break;
    case 'pending':
      facts.push(s.dispatchedAt ? `sent again ${ago(s.dispatchedAt, now)}, waiting for its worker` : 'waiting for its worker');
      break;
    default:
      if (s.finishedAt) facts.push(`${s.status === 'failed' ? 'failed' : 'finished'} ${fmtTime(s.finishedAt)}`);
  }
  const retry = s.status === 'failed' ? retryState(s, maxAttempts, now) : '';
  if (retry) facts.push(retry);
  return facts.join(' · ');
}

// StepTimeline lists an item's steps in pipeline order, each with its
// status, attempts, error and retry, and retries a failed one.
export function StepTimeline({ itemId }: { itemId: string }) {
  const gql = useGql();
  const { data, loading, error, refetch } = useQuery<{ item: { processingSteps: StepRun[] } | null; retryPolicy: Policy }>(
    STEPS_Q,
    { id: itemId },
    [itemId],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The steps move as the pipeline does: refresh on this item's events.
  const refresh = useMemo(() => debounced(refetch, 800), [refetch]);
  useCatalogStream((n) => {
    if (!n.itemId || n.itemId === itemId || n.type === 'reconnected') refresh();
  });
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  async function retry(step: string) {
    setBusy(step);
    setMsg(null);
    try {
      const d = await gql<{ retryStep: { retried: boolean; message: string } }>(RETRY_STEP, { i: itemId, s: step });
      setMsg({ ok: d.retryStep.retried, text: d.retryStep.message });
      refetch();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="kat__state">
        <Spinner /> <Text variant="muted">loading steps…</Text>
      </div>
    );
  }
  if (error) return <div className="kat__err">error: {error}</div>;
  const steps = inPipelineOrder(data?.item?.processingSteps ?? []);
  const policy = data?.retryPolicy;
  const max = policy?.available ? policy.maxAttempts : null;

  return (
    <div>
      {policy && !policy.available && <div className="kat__err">retries unavailable: {policy.reason}</div>}
      {msg && <div className={msg.ok ? 'kat__ok kat__mono' : 'kat__err'}>{msg.text}</div>}
      {steps.length === 0 ? (
        <Text variant="muted">no steps.</Text>
      ) : (
        <ul className="kat__timeline" aria-label="steps">
          {steps.map((s) => {
            const tone = statusTone(s.status);
            const err = s.status === 'failed' ? s.lastError || s.error : null;
            const earlier = s.status !== 'failed' && s.lastError ? s.lastError : null;
            return (
              <li key={s.step} className="kat__event kat__step" aria-label={stepLabel(s.step)}>
                <span className={`kat__event-dot kat__dot--${tone}`} aria-hidden />
                <div className="kat__event-body">
                  <div className="kat__event-line">
                    <strong>{stepLabel(s.step)}</strong> <span className="kat__muted kat__mono">{s.step}</span>
                  </div>
                  <div className="kat__event-sub kat__muted">{stepFacts(s, max, now)}</div>
                  {err && <div className="kat__err kat__step-err">{err}</div>}
                  {earlier && <div className="kat__event-sub kat__muted">earlier error: {earlier}</div>}
                </div>
                <Badge tone={tone}>{s.status.replace(/_/g, ' ')}</Badge>
                {canRetry(s) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leading={<RotateCcw size={13} />}
                    disabled={policy ? !policy.available : false}
                    loading={busy === s.step}
                    onClick={() => void retry(s.step)}
                  >
                    Retry
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
