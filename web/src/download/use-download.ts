import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '../connection/context.tsx';
import { Aborted, type LibraryPath } from '../storage/adapter.ts';
import { saveBlob } from './save-blob.ts';

export type DownloadState =
  | { status: 'idle' }
  | { status: 'downloading'; loaded: number; total: number }
  | { status: 'failed'; error: Error };

export function useDownload(path: LibraryPath, filename: string) {
  const { storage } = useConnection();
  const [state, setState] = useState<DownloadState>({ status: 'idle' });
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async () => {
    if (!storage) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ status: 'downloading', loaded: 0, total: 0 });
    try {
      const blob = await storage.read(path, {
        signal: current.signal,
        onProgress: (loaded, total) => {
          if (!current.signal.aborted) setState({ status: 'downloading', loaded, total });
        },
      });
      if (current.signal.aborted) return;
      saveBlob(blob, filename);
      setState({ status: 'idle' });
    } catch (error) {
      if (current.signal.aborted || error instanceof Aborted) return;
      setState({ status: 'failed', error: error instanceof Error ? error : new Error(String(error)) });
    }
  }, [storage, path, filename]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = undefined;
    setState({ status: 'idle' });
  }, []);

  return { state, start, cancel };
}
