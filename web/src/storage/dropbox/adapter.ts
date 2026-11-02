import { NotFound, type FileStat, type LibraryPath, type ReadOptions, type StorageAdapter } from '../adapter.ts';
import { readBody } from '../http.ts';
import type { AccessTokens } from '../sign-in.ts';
import { createDropboxClient } from './dropbox.ts';

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
    async read(path: LibraryPath, options: ReadOptions = {}): Promise<Blob> {
      const { size } = await file(path, options.signal);
      return readBody(await dropbox.download(pathOf(path), options.signal), size, options);
    },
  };
}
