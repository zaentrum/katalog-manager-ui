import { useEffect, useState } from 'react';
import { Table, Badge, Button, Text, Spinner, Tabs } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import {
  Activity,
  RefreshCw,
  Search,
  ListVideo,
  Film,
  AudioLines,
  Captions,
  FileVideo,
  Package,
  CircleHelp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '../lib/useQuery';
import { statusTone, fmtTime } from './status';

interface ActivityEvent {
  id: string;
  itemId: string;
  itemTitle: string;
  itemType: string;
  step: string;
  status: string;
  attempts: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
}

const FEED_Q = `{ activity(limit: 100) {
  id itemId itemTitle itemType step status attempts error startedAt finishedAt updatedAt
} }`;

// Refresh cadence for the live feed. The pipeline is a DB state machine advanced
// by polling workers, so a few seconds is plenty to watch steps flip.
const POLL_MS = 5000;

// Each pipeline step, translated for a non-technical reader: an icon, a short
// label, and a plain-language verb describing what happened to the title.
const STEP_META: Record<string, { label: string; verb: string; Icon: LucideIcon }> = {
  tmdb: { label: 'Metadata', verb: 'Looked up the title details', Icon: Search },
  enrich: { label: 'Metadata', verb: 'Looked up the title details', Icon: Search },
  chapter: { label: 'Chapters', verb: 'Detected chapter markers', Icon: ListVideo },
  blackframe: { label: 'Scenes', verb: 'Scanned for intros & credits', Icon: Film },
  silence: { label: 'Audio', verb: 'Analysed the soundtrack', Icon: AudioLines },
  subtitle: { label: 'Subtitles', verb: 'Prepared the subtitles', Icon: Captions },
  transcode: { label: 'Video', verb: 'Converted the video for streaming', Icon: FileVideo },
  package: { label: 'Packaging', verb: 'Packaged it for playback', Icon: Package },
};

function stepMeta(step: string) {
  return STEP_META[step] ?? { label: step, verb: `Ran "${step}"`, Icon: CircleHelp };
}

// Friendly status wording (the DB uses pending/in_progress/done/failed).
function statusWord(s: string): string {
  switch (s) {
    case 'done':
    case 'complete':
    case 'completed':
      return 'ready';
    case 'in_progress':
    case 'processing':
      return 'running';
    case 'failed':
    case 'partial_failure':
      return 'needs attention';
    case 'pending':
    case 'queued':
      return 'queued';
    default:
      return s;
  }
}

// Compact relative time ("just now", "3m ago", "2h ago"); falls back to a date.
function fmtRel(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return fmtTime(s);
}

export function ActivityView() {
  const { data, loading, error, refetch } = useQuery<{ activity: ActivityEvent[] }>(FEED_Q);
  const [view, setView] = useState<'friendly' | 'technical'>('friendly');

  // Live tail: re-poll on an interval so the operator watches the pipeline move.
  useEffect(() => {
    const t = setInterval(refetch, POLL_MS);
    return () => clearInterval(t);
  }, [refetch]);

  const rows = data?.activity ?? [];

  const cols: TableColumn<ActivityEvent>[] = [
    { key: 'updatedAt', header: 'when', render: (r) => fmtTime(r.updatedAt) },
    {
      key: 'itemTitle',
      header: 'title',
      render: (r) => (
        <span>
          {r.itemTitle || <span className="kat__muted">(untitled)</span>}
          <span className="kat__muted"> · {r.itemType}</span>
        </span>
      ),
    },
    { key: 'step', header: 'step', render: (r) => <span className="kat__mono">{r.step}</span> },
    { key: 'status', header: 'status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: 'attempts', header: 'tries', align: 'right', render: (r) => r.attempts ?? 0 },
    {
      key: 'error',
      header: 'error',
      render: (r) => (r.error ? <span className="kat__err">{r.error}</span> : <span className="kat__muted">—</span>),
    },
  ];

  return (
    <div>
      <div className="kat__toolbar">
        <Tabs
          items={[
            { value: 'friendly', label: 'friendly' },
            { value: 'technical', label: 'technical' },
          ]}
          value={view}
          onChange={(v) => setView(v as 'friendly' | 'technical')}
        />
        <span className="kat__spacer" />
        <Badge tone="blue" dot>
          live · every {POLL_MS / 1000}s
        </Badge>
        <Button variant="ghost" size="sm" leading={<RefreshCw size={14} />} onClick={refetch}>
          refresh
        </Button>
      </div>

      {error && <div className="kat__err">error: {error}</div>}

      {loading && !data ? (
        <div className="kat__state">
          <Spinner /> <Text variant="muted">loading activity…</Text>
        </div>
      ) : view === 'technical' ? (
        <Table
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          dense
          empty={<Text variant="muted">no pipeline activity yet — trigger a scan to seed work.</Text>}
        />
      ) : rows.length === 0 ? (
        <div className="kat__state">
          <Activity size={16} className="kat__muted" />
          <Text variant="muted">Nothing happening yet. Add or scan media to see the pipeline work.</Text>
        </div>
      ) : (
        <ul className="kat__timeline">
          {rows.map((r) => {
            const m = stepMeta(r.step);
            const tone = statusTone(r.status);
            return (
              <li key={r.id} className="kat__event">
                <span className={`kat__event-dot kat__dot--${tone}`}>
                  <m.Icon size={15} strokeWidth={1.75} />
                </span>
                <div className="kat__event-body">
                  <div className="kat__event-line">
                    <strong>{r.itemTitle || '(untitled)'}</strong>
                    <span className="kat__muted"> — {m.verb.toLowerCase()}</span>
                  </div>
                  <div className="kat__event-sub kat__muted">
                    {m.label} · {fmtRel(r.updatedAt)}
                    {r.error ? ` · ${r.error}` : ''}
                  </div>
                </div>
                <Badge tone={tone}>{statusWord(r.status)}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
