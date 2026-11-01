import { useEffect, useMemo, useRef, useState } from 'react';
import { Table, Badge, Button, Input, Select, Field, Spinner, Text } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import { Search, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useArtwork, useSeen } from '../lib/artwork';
import { useQuery } from '../lib/useQuery';
import { useCatalogStream, debounced } from '../lib/stream';
import { HAS_ORIGINAL_OPTIONS, LIST_Q, LIST_Q_UNSIZED, listVariables, withoutSizes } from './catalog';
import { sizeText } from './compliance';
import { noticeFrom, type DeletionNotice } from './deletion';
import { statusTone } from './status';

interface Item {
  id: string;
  type: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  isPackaged: boolean;
  overallStatus: { overallStatus: string | null } | null;
  // what it has on disk, from a katalog-manager that says it (LIST_Q);
  // hasOriginal null of a series, a season or an album
  hasOriginal?: boolean | null;
  originalBytes?: number | null;
  packageBytes?: number | null;
}

const GENRES_Q = `{ genres { name } }`;

// What each item has on disk, after its year: whether it has an original,
// badged as the packaged column badges its state, a word either way, '—'
// only where katalog-manager says nothing (a series, a season, an album),
// and the sizes of its originals and of its package as the rules tab writes
// sizes, numbers to the right in figures of one width, '—' for none.
const sizeColumns: TableColumn<Item>[] = [
  {
    key: 'hasOriginal',
    header: 'has original',
    render: (r) =>
      r.hasOriginal == null ? (
        '—'
      ) : r.hasOriginal ? (
        <Badge tone="green" dot>
          yes
        </Badge>
      ) : (
        <Badge tone="neutral">no</Badge>
      ),
  },
  {
    key: 'originalBytes',
    header: 'original',
    align: 'right',
    render: (r) => <span className="kat__num">{sizeText(r.originalBytes)}</span>,
  },
  {
    key: 'packageBytes',
    header: 'package',
    align: 'right',
    render: (r) => <span className="kat__num">{sizeText(r.packageBytes)}</span>,
  },
];

export function CatalogList() {
  const nav = useNavigate();
  // What the item page just deleted, if it did (see ItemDetail's delete).
  const loc = useLocation();
  const deleted = noticeFrom(loc.state);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [hasOriginal, setHasOriginal] = useState('');
  // A katalog-manager older than the sizes refuses a list that asks for
  // them: from then on the list is read without them, and shows neither
  // their columns nor their filter.
  const [unsized, setUnsized] = useState(false);
  const sized = !unsized;

  const vars = listVariables({ search, type, genre, year, hasOriginal }, sized);
  const { data, loading, error, refetch } = useQuery<{ items: Item[] }>(sized ? LIST_Q : LIST_Q_UNSIZED, vars, [
    search,
    type,
    genre,
    year,
    hasOriginal,
  ]);
  // the refusal is no error to show: the list reads again without them
  const refused = withoutSizes(error);
  useEffect(() => {
    if (refused) setUnsized(true);
  }, [refused]);
  // Live refresh: new/updated items appear without a manual reload (debounced —
  // one refetch per pipeline burst).
  const refresh = useMemo(() => debounced(refetch, 1200), [refetch]);
  useCatalogStream(refresh);
  const genresData = useQuery<{ genres: { name: string }[] }>(GENRES_Q);

  const columns: TableColumn<Item>[] = [
    { key: 'posterUrl', header: '', width: 40, render: (r) => <Thumb url={r.posterUrl} /> },
    {
      key: 'title',
      header: 'title',
      // a real link: reachable by keyboard, and it opens in a new tab
      render: (r) => (
        <Link className="kat__rowlink" to={`/item/${r.id}`}>
          {r.title}
        </Link>
      ),
    },
    { key: 'type', header: 'type', render: (r) => <span className="kat__mono">{r.type}</span> },
    { key: 'year', header: 'year', align: 'right', render: (r) => r.year ?? '—' },
    ...(sized ? sizeColumns : []),
    {
      key: 'isPackaged',
      header: 'packaged',
      render: (r) =>
        r.isPackaged ? (
          <Badge tone="green" dot>
            ready
          </Badge>
        ) : (
          <Badge tone="neutral">—</Badge>
        ),
    },
    {
      key: 'id',
      header: 'status',
      render: (r) => {
        const s = r.overallStatus?.overallStatus ?? 'unknown';
        return <Badge tone={statusTone(s)}>{s}</Badge>;
      },
    },
  ];

  return (
    <div>
      {deleted && (
        <Deleted
          notice={deleted}
          onDismiss={() => nav({ pathname: loc.pathname, search: loc.search }, { replace: true, state: null })}
        />
      )}
      <div className="kat__filters">
        <Field label="search">
          <Input
            placeholder="title…"
            value={search}
            leading={<Search size={14} />}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field label="type">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              { label: 'all', value: '' },
              { label: 'movie', value: 'movie' },
              { label: 'series', value: 'series' },
              { label: 'episode', value: 'episode' },
              { label: 'album', value: 'album' },
            ]}
          />
        </Field>
        <Field label="genre">
          <Select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            options={[
              { label: 'all', value: '' },
              ...(genresData.data?.genres ?? []).map((g) => ({ label: g.name, value: g.name })),
            ]}
          />
        </Field>
        <Field label="year">
          <Input type="number" placeholder="any" value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
        {sized && (
          <Field label="has original">
            <Select value={hasOriginal} onChange={(e) => setHasOriginal(e.target.value)} options={HAS_ORIGINAL_OPTIONS} />
          </Field>
        )}
        <div className="kat__spacer" />
        <div className="kat__filter-end">
          {!loading && data && <Text variant="dim">{data.items.length} items</Text>}
        </div>
      </div>

      {error && !refused && <div className="kat__err">error: {error}</div>}
      {(loading || refused) && !data ? (
        <div className="kat__state">
          <Spinner /> <Text variant="muted">loading catalog…</Text>
        </div>
      ) : (
        <Table
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(r) => r.id}
          dense
          empty={<Text variant="muted">no items match.</Text>}
        />
      )}
    </div>
  );
}

// A row's poster, fetched with the bearer token (see useArtwork) once the row
// comes near the viewport: a list of 200 titles loads the posters it shows,
// not every one at once. Until then, and without a poster, an empty frame.
function Thumb({ url }: { url: string | null }) {
  const frame = useRef<HTMLDivElement>(null);
  const src = useArtwork(useSeen(frame) ? url : null);
  if (!src) return <div ref={frame} className="kat__poster" />;
  return (
    <img
      className="kat__poster"
      src={src}
      alt=""
      onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
    />
  );
}

// Deleted says what the last delete removed, and the errors it met; they stay
// until the admin dismisses them.
function Deleted({ notice, onDismiss }: { notice: DeletionNotice; onDismiss: () => void }) {
  return (
    <div className="kat__notice" role="status">
      <Trash2 size={15} />
      <div className="kat__notice-body">
        <Text variant="ui">deleted “{notice.title}”</Text>
        <Text variant="muted">{notice.summary}</Text>
        {notice.errors.map((e, i) => (
          <div key={i} className="kat__err">
            {e}
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        dismiss
      </Button>
    </div>
  );
}
