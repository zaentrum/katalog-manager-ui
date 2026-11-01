import { useCallback, useEffect, useState } from 'react';
import { useGql } from './gql';
import { read } from './read';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** useQuery runs a GraphQL query on mount + whenever `deps` change. Each read
 *  is called off when the next one begins and when the view goes (the
 *  effect's cleanup), so only the newest read's answer is taken. */
export function useQuery<T>(query: string, variables?: Record<string, unknown>, deps: unknown[] = []): QueryState<T> {
  const gql = useGql();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // keep variables stable across renders by serialising
  const varsKey = JSON.stringify(variables ?? {});

  useEffect(
    () =>
      read(() => gql<T>(query, variables), {
        start: () => {
          setLoading(true);
          setError(null);
        },
        data: (d) => setData(d),
        error: (message) => setError(message),
        done: () => setLoading(false),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, varsKey, nonce, ...deps],
  );

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, refetch };
}
