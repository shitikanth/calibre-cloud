import { NotFound, type FileStat, type LibraryPath, type ReadOptions, type StorageAdapter } from '../adapter.ts';
import { readBody } from '../http.ts';
import type { AccessTokens } from '../sign-in.ts';
import { createDriveClient, query } from './drive.ts';

export function createGoogleAdapter(root: string, tokens: AccessTokens): StorageAdapter {
  const drive = createDriveClient(tokens);
  const folders = new Map<string, string>([['', root]]);

  const child = (kind: 'folder' | 'file', parent: string, name: string, signal: AbortSignal | undefined) =>
    drive.first(query({ kind, in: parent, name }), 'id,size,md5Checksum', signal);

  const find = async (path: LibraryPath, signal: AbortSignal | undefined) => {
    const segments = path.split('/').filter(Boolean);
    const name = segments.pop();
    if (!name) throw new NotFound(path);
    let folder = root;
    for (const [i, segment] of segments.entries()) {
      const key = segments.slice(0, i + 1).join('/');
      const known = folders.get(key);
      if (known) {
        folder = known;
        continue;
      }
      const found = await child('folder', folder, segment, signal);
      if (!found) throw new NotFound(path);
      folders.set(key, found.id);
      folder = found.id;
    }
    const file = await child('file', folder, name, signal);
    if (!file) throw new NotFound(path);
    return { id: file.id, size: Number(file.size ?? 0), version: file.md5Checksum ?? '' };
  };

  return {
    async stat(path: LibraryPath): Promise<FileStat> {
      const { size, version } = await find(path, undefined);
      return { size, version };
    },
    async read(path: LibraryPath, options: ReadOptions = {}): Promise<Blob> {
      const file = await find(path, options.signal);
      return readBody(await drive.media(file.id, options.signal), file.size, options);
    },
  };
}
