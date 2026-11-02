import { Network, NotFound, type FileStat, type LibraryPath, type ReadOptions, type StorageAdapter } from '../adapter.ts';
import { readBody } from '../http.ts';
import type { AccessTokens } from '../sign-in.ts';
import { createGraphClient, DownloadUrlExpired, type DriveItem } from './graph.ts';

export function createOneDriveAdapter(root: string, tokens: AccessTokens): StorageAdapter {
  const graph = createGraphClient(tokens);

  const pathOf = (path: LibraryPath) => {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) throw new NotFound(path);
    return [root, ...segments].join('/');
  };

  const file = async (path: LibraryPath, signal: AbortSignal | undefined): Promise<DriveItem & { file: object }> => {
    const item = await graph.item(pathOf(path), signal);
    if (!item.file) throw new NotFound(path);
    return { ...item, file: item.file };
  };

  const downloadUrlOf = (item: DriveItem) => {
    const url = item['@microsoft.graph.downloadUrl'];
    if (url === undefined) throw new Network('Microsoft Graph gave no download URL');
    return url;
  };

  return {
    async stat(path: LibraryPath): Promise<FileStat> {
      const item = await file(path, undefined);
      return { size: item.size ?? 0, version: item.cTag ?? '' };
    },
    async read(path: LibraryPath, options: ReadOptions = {}): Promise<Blob> {
      const { signal } = options;
      const item = await file(path, signal);
      let response: Response;
      try {
        response = await graph.download(downloadUrlOf(item), signal);
      } catch (error) {
        if (!(error instanceof DownloadUrlExpired)) throw error;
        try {
          response = await graph.download(downloadUrlOf(await file(path, signal)), signal);
        } catch (again) {
          throw again instanceof DownloadUrlExpired ? new Network(again.message) : again;
        }
      }
      return readBody(response, item.size ?? 0, options);
    },
  };
}
