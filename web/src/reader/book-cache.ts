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

async function dropEntries(cache: Cache, drop: (entry: Entry) => boolean): Promise<void> {
  for (const request of await cache.keys()) {
    const entry = parseKey(request.url);
    if (entry && drop(entry)) await cache.delete(request).catch(() => undefined);
  }
  const recent = await readRecent(cache);
  const kept = recent.filter((entry) => !drop(entry));
  if (kept.length !== recent.length) await writeRecent(cache, kept);
}

async function rememberOpened(cache: Cache, entry: Entry): Promise<void> {
  const others = (await readRecent(cache)).filter((other) => !sameFormat(other, entry));
  const evicted = others.slice(KEEP - 1);
  const stale = (other: Entry) =>
    (sameFormat(other, entry) && other.version !== entry.version) || evicted.some((old) => sameFormat(old, other));
  await dropEntries(cache, stale);
  await writeRecent(cache, [entry, ...others.slice(0, KEEP - 1)]);
}

function quietly(task: () => Promise<void>): void {
  void task().catch(() => undefined);
}

async function cachedCopy(cache: Cache, key: BookFormatKey): Promise<BookFile | undefined> {
  const entry = (await readRecent(cache)).find((candidate) => sameFormat(candidate, key));
  if (!entry) return undefined;
  const blob = await cache
    .match(entryKey(entry))
    .then((response) => response?.blob())
    .catch(() => undefined);
  if (!blob) return undefined;
  quietly(() => rememberOpened(cache, entry));
  return { blob, version: entry.version };
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
  const hit = cache && (await cachedCopy(cache, entry));
  if (hit && hit.version === version) return hit;
  const blob = await storage.read(path, options);
  if (cache) quietly(() => store(cache, entry, blob));
  return { blob, version };
}

async function store(cache: Cache, entry: Entry, blob: Blob): Promise<void> {
  try {
    await cache.put(entryKey(entry), new Response(blob));
    await rememberOpened(cache, entry);
  } catch {
    await dropEntries(cache, (other) => sameFormat(other, entry));
  }
}

async function forgetWhere(drop: (entry: BookFormatKey) => boolean): Promise<void> {
  const cache = await existingCache();
  if (cache) await dropEntries(cache, drop).catch(() => undefined);
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
