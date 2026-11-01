// One read of a query, as useQuery runs it: no React, so `npm test` runs it
// under node as it is.

/** What a read hands its outcome to: that it began, then its data or its
 *  error, then that it is done. */
export interface ReadHandlers<T> {
  start(): void;
  data(d: T): void;
  error(message: string): void;
  done(): void;
}

/** read begins a read and hands its outcome on until it is called off, by
 *  the function it returns. useQuery calls a read off before it begins the
 *  next one and when its view goes, so the answer of a read a newer one
 *  followed, or whose view went, is dropped: a slow older answer never
 *  overwrites a newer one. */
export function read<T>(fetch: () => Promise<T>, on: ReadHandlers<T>): () => void {
  let current = true;
  on.start();
  fetch()
    .then((d) => {
      if (current) on.data(d);
    })
    .catch((e: unknown) => {
      if (current) on.error(e instanceof Error ? e.message : String(e));
    })
    .finally(() => {
      if (current) on.done();
    });
  return () => {
    current = false;
  };
}
