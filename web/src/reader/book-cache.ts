import type { BookFormatKey } from '../library/protocol.ts';
import { Network, type LibraryPath, type ReadOptions, type StorageAdapter } from '../storage/adapter.ts';

const CACHE_NAME = 'calibre-cloud:books';
const KEEP = 3;

export type BookFile = { blob: Blob; version: string };
export type BookFileKey = BookFormatKey & { path: LibraryPath };

type Entry = BookFormatKey & { version: string };

function entryKey({ bookId, format, version }: Entry): string {
  return `${location.origin}/__books/${bookId}/${encodeURIComponent(format)}/${encodeURIComponent(version)}`;
}

function recentKey(): string {
  return `${location.origin}/__books/recent`;
}

function parseKey(url: string): Entry | undefined {
  const [, root, bookId, format, version] = new URL(url).pathname.split('/');
  if (root !== '__books' || bookId === undefined || format === undefined || version === undefined) return undefined;
  return { bookId: Number(bookId), format: decodeURIComponent(format), version: decodeURIComponent(version) };
}

function sameFormat(a: BookFormatKey, b: BookFormatKey): boolean {
  return a.bookId === b.bookId && a.format === b.format;
}

async function openCache(): Promise<Cache | undefined> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return undefined;
  }
}

async function existingCache(): Promise<Cache | undefined> {
  try {
    return (await caches.has(CACHE_NAME)) ? await caches.open(CACHE_NAME) : undefined;
  } catch {
    return undefined;
  }
}

async function readRecent(cache: Cache): Promise<Entry[]> {
  try {
    const response = await cache.match(recentKey());
    return response ? ((await response.json()) as Entry[]) : [];
  } catch {
    return [];
  }
}

async function writeRecent(cache: Cache, entries: Entry[]): Promise<void> {
  await cache.put(recentKey(), Response.json(entries)).catch(() => undefined);
}

async function touch(cache: Cache, entry: Entry): Promise<void> {
  const recent = await readRecent(cache);
  const kept = recent.filter((other) => !sameFormat(other, entry));
  const evicted = kept.slice(KEEP - 1);
  await writeRecent(cache, [entry, ...kept.slice(0, KEEP - 1)]);
  for (const stale of recent)
    if ((sameFormat(stale, entry) && stale.version !== entry.version) || evicted.includes(stale))
      await cache.delete(entryKey(stale)).catch(() => undefined);
}

async function cachedCopy(cache: Cache, key: BookFormatKey): Promise<BookFile | undefined> {
  const entry = (await readRecent(cache)).find((candidate) => sameFormat(candidate, key));
  const response = entry && (await cache.match(entryKey(entry)));
  return response && entry ? { blob: await response.blob(), version: entry.version } : undefined;
}

export async function openBookFile(
  storage: StorageAdapter,
  { bookId, format, path }: BookFileKey,
  options: ReadOptions,
): Promise<BookFile> {
  const cache = await openCache();
  let version: string;
  try {
    ({ version } = await storage.stat(path));
  } catch (error) {
    const copy = error instanceof Network && cache ? await cachedCopy(cache, { bookId, format }) : undefined;
    if (!copy) throw error;
    return copy;
  }
  const entry = { bookId, format, version };
  const hit = await cache?.match(entryKey(entry));
  if (hit && cache) {
    await touch(cache, entry);
    return { blob: await hit.blob(), version };
  }
  const blob = await storage.read(path, options);
  if (cache) {
    const stored = await cache
      .put(entryKey(entry), new Response(blob))
      .then(() => true)
      .catch(() => false);
    if (stored) await touch(cache, entry);
  }
  return { blob, version };
}

async function forgetWhere(drop: (entry: BookFormatKey) => boolean): Promise<void> {
  const cache = await existingCache();
  if (!cache) return;
  for (const request of await cache.keys()) {
    const entry = parseKey(request.url);
    if (entry && drop(entry)) await cache.delete(request);
  }
  const recent = await readRecent(cache);
  const kept = recent.filter((entry) => !drop(entry));
  if (kept.length !== recent.length) await writeRecent(cache, kept);
}

export function forgetBookFile(bookId: number, format: string): Promise<void> {
  return forgetWhere((entry) => sameFormat(entry, { bookId, format }));
}

export function forgetStaleBookFiles(keep: BookFormatKey[]): Promise<void> {
  return forgetWhere((entry) => !keep.some((kept) => sameFormat(kept, entry)));
}

export async function forgetBookFiles(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(CACHE_NAME);
}
