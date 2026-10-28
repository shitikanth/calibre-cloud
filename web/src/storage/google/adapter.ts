import { Aborted, Network, NotFound, type FileStat, type LibraryPath, type ReadOptions, type StorageAdapter } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { childrenOf, createDriveClient, folderType, quote } from './drive.ts';

export function createDriveAdapter(root: string, tokens: AccessTokens): StorageAdapter {
  const drive = createDriveClient(tokens);
  const folders = new Map<string, string>([['', root]]);

  const child = async (parent: string, name: string, folder: boolean, signal: AbortSignal | undefined) => {
    const type = `mimeType ${folder ? '=' : '!='} ${quote(folderType)}`;
    return drive.first(`${childrenOf(parent)} and name = ${quote(name)} and ${type} and trashed = false`, 'id,size,md5Checksum', signal);
  };

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
      const found = await child(folder, segment, true, signal);
      if (!found) throw new NotFound(path);
      folders.set(key, found.id);
      folder = found.id;
    }
    const file = await child(folder, name, false, signal);
    if (!file) throw new NotFound(path);
    return { id: file.id, size: Number(file.size ?? 0), version: file.md5Checksum ?? '' };
  };

  return {
    async stat(path: LibraryPath): Promise<FileStat> {
      const { size, version } = await find(path, undefined);
      return { size, version };
    },
    async read(path: LibraryPath, { signal, onProgress }: ReadOptions = {}): Promise<Blob> {
      const file = await find(path, signal);
      const response = await drive.media(file.id, signal);
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let loaded = 0;
      try {
        const reader = response.body?.getReader();
        for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
          if (signal?.aborted) throw new Aborted();
          chunks.push(chunk.value);
          loaded += chunk.value.byteLength;
          onProgress?.(loaded, file.size);
        }
      } catch (error) {
        if (signal?.aborted || error instanceof Aborted) throw new Aborted();
        throw new Network(error instanceof Error ? error.message : String(error));
      }
      return new Blob(chunks);
    },
  };
}
