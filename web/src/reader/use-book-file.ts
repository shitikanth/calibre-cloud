import { useCallback, useEffect } from 'react';
import { useConnection } from '../connection/context.tsx';
import { useFetch, type FetchOptions } from '../download/use-fetch.ts';
import type { LibraryPath } from '../storage/adapter.ts';

export type BookFile = { blob: Blob; version: string };

export function useBookFile(path: LibraryPath) {
  const { storage } = useConnection();
  const run = useCallback(
    async (options: FetchOptions): Promise<BookFile> => {
      if (!storage) throw new Error('Not connected');
      const { version } = await storage.stat(path);
      const blob = await storage.read(path, options);
      return { blob, version };
    },
    [storage, path],
  );
  const fetch = useFetch(run);
  const { start } = fetch;
  useEffect(() => void start(), [start]);
  return fetch;
}
