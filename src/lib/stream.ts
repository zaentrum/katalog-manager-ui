import { useEffect, useRef } from 'react';
import { useAuth } from 'react-oidc-context';

// Live catalog stream client. The server pushes thin catalog.updated
// notifications over SSE (/api/manage/stream); consumers debounce and refetch
// their own queries. Implemented over fetch-streaming (not EventSource) so the
// bearer header rides along like every other API call. Auto-reconnects with
// backoff, and treats a reconnect as "may have missed events" by firing the
// callback once so callers refetch.

export interface CatalogNote {
  type: string;
  itemId?: string;
  itemType?: string;
  phase?: string; // discovered|enriched|analyzed|transcoded
}

const STREAM_URL: string =
  (import.meta.env.VITE_KATALOG_STREAM as string | undefined) ?? '/api/manage/stream';

/**
 * useCatalogStream invokes onNote (debounced by the caller) for every catalog
 * event, and once on each reconnect (note = {type:'reconnected'}) so consumers
 * refetch anything they may have missed while disconnected.
 */
export function useCatalogStream(onNote: (n: CatalogNote) => void) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const cb = useRef(onNote);
  cb.current = onNote;

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let attempt = 0;
    let abort = new AbortController();

    async function connect() {
      while (!stopped) {
        try {
          abort = new AbortController();
          const res = await fetch(STREAM_URL, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal: abort.signal,
          });
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          if (attempt > 0) cb.current({ type: 'reconnected' });
          attempt = 0;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const frame = buf.slice(0, i);
              buf = buf.slice(i + 2);
              for (const line of frame.split('\n')) {
                if (line.startsWith('data: ')) {
                  try {
                    cb.current(JSON.parse(line.slice(6)) as CatalogNote);
                  } catch {
                    /* ignore malformed frames */
                  }
                }
              }
            }
          }
          throw new Error('stream ended');
        } catch {
          if (stopped) return;
          attempt += 1;
          const wait = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
    void connect();
    return () => {
      stopped = true;
      abort.abort();
    };
  }, [token]);
}

/** debounced wraps a callback so bursts of events collapse into one call. */
export function debounced(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}
