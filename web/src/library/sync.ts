import type { ReadOptions, StorageAdapter } from '../storage/adapter.ts';
import type { LibraryIndex } from './library-index.ts';
import { loadStoredLibrary, saveStoredLibrary } from './stored-library.ts';

const METADATA = 'metadata.db';

export type OpenedLibrary = { fromCache: boolean };

export async function openLibrary(
  index: LibraryIndex,
  storage: StorageAdapter,
  onProgress: ReadOptions['onProgress'],
): Promise<OpenedLibrary> {
  const stored = loadStoredLibrary();
  if (stored && (await index.openStored(stored.file))) return { fromCache: true };
  const { version } = await storage.stat(METADATA);
  await download(index, storage, version, onProgress);
  return { fromCache: false };
}

export async function updateLibrary(index: LibraryIndex, storage: StorageAdapter): Promise<boolean> {
  const { version } = await storage.stat(METADATA);
  if (loadStoredLibrary()?.version === version) return false;
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
  const file = await index.open(await blob.arrayBuffer());
  saveStoredLibrary(file === null ? undefined : { version, file });
}
