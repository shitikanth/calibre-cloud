import { Aborted, type ReadOptions } from '../adapter.ts';
import { toStorageError } from './errors.ts';

type RetryCallback = (error?: unknown) => void;

export type DownloadStream = {
  on(event: 'data', listener: (chunk: Uint8Array<ArrayBuffer>) => void): unknown;
  on(event: 'progress', listener: (progress: { bytesLoaded: number; bytesTotal: number }) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  destroy(): unknown;
};

export type DownloadOptions = {
  forceHttps: true;
  handleRetries: (tries: number, error: unknown, retry: RetryCallback) => void;
};

const maxRetries = 2;

export function downloadToBlob(
  start: (options: DownloadOptions) => DownloadStream,
  { signal, onProgress }: ReadOptions = {},
): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(new Aborted());

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      finish();
    };

    const stream = start({
      forceHttps: true,
      handleRetries: (tries, error, retry) => {
        if (settled || signal?.aborted || tries > maxRetries) retry(error);
        else setTimeout(retry, 1000 * 2 ** tries);
      },
    });
    const abort = () => {
      stream.destroy();
      settle(() => reject(new Aborted()));
    };
    signal?.addEventListener('abort', abort, { once: true });

    const chunks: Uint8Array<ArrayBuffer>[] = [];
    stream.on('data', (chunk) => {
      if (!settled) chunks.push(chunk);
    });
    stream.on('progress', ({ bytesLoaded, bytesTotal }) => {
      if (!settled) onProgress?.(bytesLoaded, bytesTotal);
    });
    stream.on('end', () => settle(() => resolve(new Blob(chunks))));
    stream.on('error', (error) => settle(() => reject(toStorageError(error))));
  });
}
