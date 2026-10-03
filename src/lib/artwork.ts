import { useEffect, useRef, useState, type RefObject } from 'react';
import { useAuth } from 'react-oidc-context';

/**
 * useSeen reports whether the element has come near the viewport (within
 * margin) at least once, so an image is fetched only when it is about to
 * show. Without IntersectionObserver everything counts as seen.
 */
export function useSeen(ref: RefObject<Element | null>, margin = '200px'): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true);
    }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, margin]);
  return seen;
}

/**
 * useArtwork loads an image katalog-manager serves behind its auth
 * (/api/manage/artwork/…) and returns an object URL for an <img>: null while it
 * loads, and when there is none (404) or it cannot be read. The artwork routes
 * take a bearer token (or a stream token this console does not mint), and an
 * <img src> cannot send the Authorization header, so the bytes are fetched
 * like every other API call and handed to the element as a blob.
 */
export function useArtwork(url: string | null): string | null {
  const auth = useAuth();
  // Read the token at fetch time: a silent renew must not reload the image.
  const token = useRef(auth.user?.access_token);
  token.current = auth.user?.access_token;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(null);
    if (!url) return;
    const abort = new AbortController();
    let objectUrl: string | null = null;
    const bearer = token.current;
    fetch(url, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      signal: abort.signal,
    })
      .then(async (res) => {
        if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return;
        const blob = await res.blob();
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        /* aborted or unreachable: no image */
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return src;
}
