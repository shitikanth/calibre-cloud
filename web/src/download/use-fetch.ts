import { useCallback, useEffect, useRef, useState } from 'react';
import { Aborted, type ReadOptions } from '../storage/adapter.ts';

export type FetchState<T> =
  | { status: 'idle' }
  | { status: 'fetching'; loaded: number; total: number }
  | { status: 'done'; result: T }
  | { status: 'failed'; error: Error };

export type FetchOptions = Required<ReadOptions>;

export function useFetch<T>(run: (options: FetchOptions) => Promise<T>) {
  const [state, setState] = useState<FetchState<T>>({ status: 'idle' });
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ status: 'fetching', loaded: 0, total: 0 });
    try {
      const result = await run({
        signal: current.signal,
        onProgress: (loaded, total) => {
          if (!current.signal.aborted) setState({ status: 'fetching', loaded, total });
        },
      });
      if (current.signal.aborted) return;
      setState({ status: 'done', result });
    } catch (error) {
      if (current.signal.aborted || error instanceof Aborted) return;
      setState({ status: 'failed', error: error instanceof Error ? error : new Error(String(error)) });
    }
  }, [run]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = undefined;
    setState({ status: 'idle' });
  }, []);

  return { state, start, cancel };
}
