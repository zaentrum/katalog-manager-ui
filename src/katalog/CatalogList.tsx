import { useMemo, useRef, useState } from 'react';
import { Table, Badge, Input, Select, Field, Spinner, Text } from '@nalet/design-system';
import type { TableColumn } from '@nalet/design-system';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useArtwork, useSeen } from '../lib/artwork';
import { useQuery } from '../lib/useQuery';
import { useCatalogStream, debounced } from '../lib/stream';
import { statusTone } from './status';

interface Item {
  id: string;
  type: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  isPackaged: boolean;
  overallStatus: { overallStatus: string | null } | null;
}

const LIST_Q = `query Catalog($type: String, $genre: String, $year: Int, $search: String) {
  items(type: $type, genre: $genre, year: $year, search: $search, limit: 200) {
    id type title year posterUrl isPackaged overallStatus { overallStatus }
  }
}`;

const GENRES_Q = `{ genres { name } }`;

export function CatalogList() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');

  const vars = {
    search: search || null,
    type: type || null,
    genre: genre || null,
    year: year ? parseInt(year, 10) : null,
  };
  const { data, loading, error, refetch } = useQuery<{ items: Item[] }>(LIST_Q, vars, [search, type, genre, year]);
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
        <div className="kat__spacer" />
        {!loading && data && <Text variant="dim">{data.items.length} items</Text>}
      </div>

      {error && <div className="kat__err">error: {error}</div>}
      {loading && !data ? (
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
