'use client';

import { useCallback, useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-run the loader (e.g. for a "Retry" button). */
  reload: () => void;
}

/**
 * Run an async loader that resolves with data, tracking loading/error state and
 * aborting in-flight work on unmount or dependency change. `deps` controls when
 * the loader re-runs; pass `null` from deps to stay idle (e.g. no token yet).
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
  enabled = true,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loader(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  return { data, loading, error, reload };
}
