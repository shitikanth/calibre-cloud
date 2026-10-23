import { useCallback } from 'react';
import { useConnection } from '../connection/context.tsx';
import type { LibraryPath } from '../storage/adapter.ts';
import { saveBlob } from './save-blob.ts';
import { useFetch, type FetchOptions, type FetchState } from './use-fetch.ts';

export type DownloadState = FetchState<void>;

export function useDownload(path: LibraryPath, filename: string) {
  const { storage } = useConnection();
  const run = useCallback(
    async (options: FetchOptions) => {
      if (!storage) return;
      saveBlob(await storage.read(path, options), filename);
    },
    [storage, path, filename],
  );
  return useFetch(run);
}
