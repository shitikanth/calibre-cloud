import { Aborted, NotFound, type FileStat, type LibraryPath, type ReadOptions, type StorageAdapter } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { createDropboxClient, toStorageError } from './dropbox.ts';

export function createDropboxAdapter(root: string, tokens: AccessTokens): StorageAdapter {
  const dropbox = createDropboxClient(tokens);

  const pathOf = (path: LibraryPath) => {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) throw new NotFound(path);
    return [root, ...segments].join('/');
  };

  const file = async (path: LibraryPath, signal: AbortSignal | undefined) => {
    const metadata = await dropbox.metadata(pathOf(path), signal);
    if (metadata['.tag'] !== 'file') throw new NotFound(path);
    return { size: metadata.size ?? 0, version: metadata.content_hash ?? '' };
  };

  return {
    stat: (path: LibraryPath): Promise<FileStat> => file(path, undefined),
    async read(path: LibraryPath, { signal, onProgress }: ReadOptions = {}): Promise<Blob> {
      const { size } = await file(path, signal);
      const response = await dropbox.download(pathOf(path), signal);
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let loaded = 0;
      try {
        const reader = response.body?.getReader();
        for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
          if (signal?.aborted) throw new Aborted();
          chunks.push(chunk.value);
          loaded += chunk.value.byteLength;
          onProgress?.(loaded, size);
        }
      } catch (error) {
        throw toStorageError(error, signal);
      }
      return new Blob(chunks);
    },
  };
}
