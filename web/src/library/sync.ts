import { forgetStaleBookFiles } from '../reader/book-cache.ts';
import { forgetPositions } from '../reader/positions.ts';
import type { ReadOptions, StorageAdapter } from '../storage/adapter.ts';
import { forgetStaleCovers } from './cover-cache.ts';
import type { LibraryIndex } from './library-index.ts';
import { withLibraryLock } from './library-lock.ts';
import { loadStoredLibrary, saveStoredLibrary } from './stored-library.ts';

const METADATA = 'metadata.db';

export type OpenedLibrary = { fromCache: boolean };

export async function openLibrary(
  index: LibraryIndex,
  storage: StorageAdapter,
  onProgress: ReadOptions['onProgress'],
): Promise<OpenedLibrary> {
  const stored = loadStoredLibrary();
  if (stored && (await index.openStored(stored.file)) !== 'missing') return { fromCache: true };
  const { version } = await storage.stat(METADATA);
  await download(index, storage, version, onProgress);
  return { fromCache: false };
}

export async function updateLibrary(index: LibraryIndex, storage: StorageAdapter): Promise<boolean> {
  const { version } = await storage.stat(METADATA);
  const stored = loadStoredLibrary();
  if (stored?.version === version) {
    const opened = await index.openStored(stored.file);
    if (opened !== 'missing') return opened === 'opened';
  }
  await download(index, storage, version);
  return true;
}

async function download(
  index: LibraryIndex,
  storage: StorageAdapter,
  version: string,
  onProgress?: ReadOptions['onProgress'],
): Promise<void> {
  const blob = await storage.read(METADATA, onProgress ? { onProgress } : {});
  const bytes = await blob.arrayBuffer();
  await withLibraryLock('exclusive', async () => {
    const file = await index.open(bytes);
    saveStoredLibrary(file === null ? undefined : { version, file });
  });
  await forgetStaleCovers(await index.listCoverVersions());
  const formats = await index.listBookFormats();
  await forgetStaleBookFiles(formats);
  forgetPositions(formats);
}
