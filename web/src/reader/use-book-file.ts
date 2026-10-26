import { useCallback, useEffect } from 'react';
import { useConnection } from '../connection/context.tsx';
import { useFetch, type FetchOptions } from '../download/use-fetch.ts';
import { openBookFile, type BookFile, type BookFileKey } from './book-cache.ts';

export function useBookFile({ bookId, format, path }: BookFileKey) {
  const { storage } = useConnection();
  const run = useCallback(
    async (options: FetchOptions): Promise<BookFile> => {
      if (!storage) throw new Error('Not connected');
      return openBookFile(storage, { bookId, format, path }, options);
    },
    [storage, bookId, format, path],
  );
  const fetch = useFetch(run);
  const { start } = fetch;
  useEffect(() => void start(), [start]);
  return fetch;
}
