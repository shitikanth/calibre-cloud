import { NotFound, type FileStat, type LibraryPath, type ReadOptions, type StorageAdapter } from '../adapter.ts';
import { downloadToBlob, type DownloadOptions, type DownloadStream } from './download.ts';
import { toStorageError } from './errors.ts';
import { resolveLibraryPath, type FolderTreeNode } from './resolve.ts';

interface MegaNode extends FolderTreeNode<MegaNode> {
  size?: number;
  download(options: DownloadOptions): DownloadStream;
}

export function createMegaAdapter(link: string): StorageAdapter {
  let listing: Promise<MegaNode> | undefined;

  const fetchListing = () => {
    const fetched: Promise<MegaNode> = (async () => {
      const { File: MegaFile } = await import('megajs');
      const root = MegaFile.fromURL(link);
      await root.loadAttributes();
      return root as unknown as MegaNode;
    })().catch((error: unknown) => {
      if (listing === fetched) listing = undefined;
      throw toStorageError(error);
    });
    listing = fetched;
    return fetched;
  };

  const find = (root: MegaNode, path: LibraryPath) => {
    const node = resolveLibraryPath(root, path);
    if (!node) throw new NotFound(path);
    return node;
  };

  const findCached = async (path: LibraryPath) => {
    const cached = listing;
    const node = cached && resolveLibraryPath(await cached, path);
    return node ?? find(await fetchListing(), path);
  };

  return {
    async stat(path: LibraryPath): Promise<FileStat> {
      const node = find(await fetchListing(), path);
      return { size: node.size ?? 0, version: String(node.timestamp) };
    },
    async read(path: LibraryPath, options?: ReadOptions): Promise<Blob> {
      const node = await findCached(path);
      return downloadToBlob((downloadOptions) => node.download(downloadOptions), options);
    },
  };
}
