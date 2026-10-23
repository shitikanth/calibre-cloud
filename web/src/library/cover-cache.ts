import type { StorageAdapter } from '../storage/adapter.ts';
import type { BookSummary, CoverVersion } from './protocol.ts';

const CACHE_NAME = 'calibre-cloud:covers';

type Cover = NonNullable<BookSummary['cover']>;

function coverKey(bookId: number, version: string): string {
  return `${location.origin}/__covers/${bookId}/${encodeURIComponent(version)}`;
}

async function openCache(): Promise<Cache | undefined> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return undefined;
  }
}

export async function loadCover(
  storage: StorageAdapter,
  bookId: number,
  cover: Cover,
  signal: AbortSignal,
): Promise<Blob> {
  const cache = await openCache();
  const key = coverKey(bookId, cover.version);
  const cached = await cache?.match(key);
  if (cached) return cached.blob();
  const blob = await storage.read(cover.path, { signal });
  await cache?.put(key, new Response(blob)).catch(() => undefined);
  return blob;
}

export async function forgetStaleCovers(current: CoverVersion[]): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  const keep = new Set(current.map(({ bookId, version }) => coverKey(bookId, version)));
  for (const request of await cache.keys()) if (!keep.has(request.url)) await cache.delete(request);
}

export async function forgetCovers(): Promise<void> {
  await caches.delete(CACHE_NAME).catch(() => undefined);
}
