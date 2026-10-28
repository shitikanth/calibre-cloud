import { useCallback, useEffect, useState } from 'react';
import { useConnection } from '../connection/context.tsx';
import { useFetch, type FetchOptions, type FetchState } from '../download/use-fetch.ts';
import { openBookFile, type BookFile, type BookFileKey } from './book-cache.ts';

type BookFileState = FetchState<BookFile> | { status: 'checking' };

export function useBookFile({ bookId, format, path }: BookFileKey) {
  const { storage } = useConnection();
  const [downloading, setDownloading] = useState(false);
  const run = useCallback(
    async (options: FetchOptions): Promise<BookFile> => {
      if (!storage) throw new Error('Not connected');
      setDownloading(false);
      const onDownload = () => {
        if (!options.signal.aborted) setDownloading(true);
      };
      return openBookFile(storage, { bookId, format, path }, { ...options, onDownload });
    },
    [storage, bookId, format, path],
  );
  const { state: fetchState, start, cancel } = useFetch(run);
  useEffect(() => void start(), [start]);
  const state: BookFileState = fetchState.status === 'fetching' && !downloading ? { status: 'checking' } : fetchState;
  return { state, start, cancel };
}
