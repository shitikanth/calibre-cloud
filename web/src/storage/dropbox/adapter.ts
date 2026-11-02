import type { FileStat, LibraryPath, StorageAdapter } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { createDropboxClient } from './dropbox.ts';

export function createDropboxAdapter(root: string, tokens: AccessTokens): StorageAdapter {
  const dropbox = createDropboxClient(tokens);
  const pathOf = (path: LibraryPath) => `${root}/${path}`;

  return {
    async stat(path: LibraryPath): Promise<FileStat> {
      const metadata = await dropbox.metadata(pathOf(path), undefined);
      return { size: metadata.size ?? 0, version: metadata.content_hash ?? '' };
    },
    read(): Promise<Blob> {
      throw new Error('Not implemented');
    },
  };
}
