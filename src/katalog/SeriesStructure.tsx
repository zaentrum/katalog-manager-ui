import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Spinner, Text } from '@nalet/design-system';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGql } from '../lib/gql';
import { useCatalogStream, debounced } from '../lib/stream';
import { statusTone } from './status';
import { episodeLabel } from './people';
import { episodeState, seasonSummary, seasonsOf, type EpisodeRow } from './processing';

// katalog-manager answers at most this many episodes at a time.
const PAGE = 200;

const EPISODES_Q = `query SeriesEpisodes($id: ID!, $offset: Int) {
  episodes(seriesId: $id, limit: ${PAGE}, offset: $offset) {
    id title seasonNumber episodeNumber isPackaged overallStatus { overallStatus failedCount }
  }
}`;

// SeriesStructure is a series' seasons and episodes as a tree, each episode
// with its processing state; a season opens and closes, and one with an
// episode that needs attention comes open.
export function SeriesStructure({ seriesId, from }: { seriesId: string; from: { id: string; title: string } }) {
  const gql = useGql();
  const [episodes, setEpisodes] = useState<EpisodeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const live = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: EpisodeRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const d = await gql<{ episodes: EpisodeRow[] }>(EPISODES_Q, { id: seriesId, offset });
        all.push(...d.episodes);
        if (d.episodes.length < PAGE) break;
      }
      if (live.current) setEpisodes(all);
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (live.current) setLoading(false);
    }
  }, [gql, seriesId]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  const refresh = useMemo(() => debounced(() => void load(), 2000), [load]);
  useCatalogStream(refresh);

  const seasons = useMemo(() => seasonsOf(episodes ?? []), [episodes]);
  const needsAttention = (key: string) => {
    const s = seasons.find((x) => x.key === key);
    return !!s && ((s.states.failed ?? 0) > 0 || (s.states.partial_failure ?? 0) > 0);
  };
  const isOpen = (key: string) => open[key] ?? (seasons.length <= 2 || needsAttention(key));

  if (loading && !episodes) {
    return (
      <div className="kat__state">
        <Spinner /> <Text variant="muted">loading episodes…</Text>
      </div>
    );
  }
  if (error) return <div className="kat__err">error: {error}</div>;
  if (seasons.length === 0) return <Text variant="muted">no episodes.</Text>;

  return (
    <div>
      <div className="kat__toolbar">
        <Text variant="dim">
          {episodes?.length ?? 0} episodes in {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}
        </Text>
        <span className="kat__spacer" />
        <Button variant="ghost" size="sm" onClick={() => setOpen(Object.fromEntries(seasons.map((s) => [s.key, true])))}>
          Expand All
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(Object.fromEntries(seasons.map((s) => [s.key, false])))}>
          Collapse All
        </Button>
        <Button variant="ghost" size="sm" leading={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <ul className="kat__tree" role="tree" aria-label="seasons and episodes">
        {seasons.map((s) => {
          const expanded = isOpen(s.key);
          return (
            <li key={s.key} role="treeitem" aria-expanded={expanded} aria-label={s.label} className="kat__tree-season">
              <button
                type="button"
                className="kat__tree-toggle"
                aria-label={`${expanded ? 'collapse' : 'expand'} ${s.label}`}
                onClick={() => setOpen((o) => ({ ...o, [s.key]: !expanded }))}
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <strong>{s.label}</strong>
                <span className="kat__muted"> · {seasonSummary(s)}</span>
              </button>
              {expanded && (
                <ul role="group" className="kat__tree-episodes">
                  {s.episodes.map((e) => {
                    const state = episodeState(e);
                    return (
                      <li key={e.id} role="treeitem" aria-label={e.title} className="kat__tree-episode">
                        <span className="kat__mono kat__muted kat__tree-code">
                          {episodeLabel(e.seasonNumber, e.episodeNumber) || '—'}
                        </span>
                        <Link className="kat__rowlink" to={`/item/${e.id}`} state={{ from }}>
                          {e.title || '(untitled)'}
                        </Link>
                        <span className="kat__spacer" />
                        {e.isPackaged && (
                          <Badge tone="green" dot>
                            packaged
                          </Badge>
                        )}
                        <Badge tone={statusTone(state)}>{state.replace(/_/g, ' ')}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
