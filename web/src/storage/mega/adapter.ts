import { NotFound, type FileStat, type LibraryPath, type ReadOptions, type StorageAdapter } from '../adapter.ts';
import { downloadToBlob, type DownloadOptions, type DownloadStream } from './download.ts';
import { toStorageError } from './errors.ts';
import { resolveLibraryPath, type FolderTreeNode } from './resolve.ts';

interface MegaNode extends FolderTreeNode<MegaNode> {
  size?: number;
  download(options: DownloadOptions): DownloadStream;
}

export function createMegaAdapter(link: string): StorageAdapter {
  let tree: Promise<MegaNode> | undefined;

  const loadTree = () => {
    tree ??= (async () => {
      const { File: MegaFile } = await import('megajs');
      const root = MegaFile.fromURL(link);
      await root.loadAttributes();
      return root as unknown as MegaNode;
    })().catch((error: unknown) => {
      tree = undefined;
      throw toStorageError(error);
    });
    return tree;
  };

  const find = async (path: LibraryPath) => {
    const node = resolveLibraryPath(await loadTree(), path);
    if (!node) throw new NotFound(path);
    return node;
  };

  return {
    async stat(path: LibraryPath): Promise<FileStat> {
      const node = await find(path);
      return { size: node.size ?? 0, version: String(node.timestamp) };
    },
    async read(path: LibraryPath, options?: ReadOptions): Promise<Blob> {
      const node = await find(path);
      return downloadToBlob((downloadOptions) => node.download(downloadOptions), options);
    },
  };
}
