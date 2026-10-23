import type { BookFormatKey } from '../library/protocol.ts';

export type ReadingPosition = { location: string; fraction: number; openedAt: number };

export type PositionEntry = BookFormatKey & ReadingPosition;

const storageKey = 'calibre-cloud:positions';

const SAVE_INTERVAL_MS = 1_000;

type Store = Record<string, ReadingPosition>;

const listeners = new Set<() => void>();

let snapshot: { raw: string | null; entries: PositionEntry[] } | undefined;

function entryKey(bookId: number, format: string): string {
  return `${bookId}/${format}`;
}

function parseKey(key: string): BookFormatKey | undefined {
  const slash = key.indexOf('/');
  if (slash < 1) return undefined;
  const bookId = Number(key.slice(0, slash));
  return Number.isInteger(bookId) ? { bookId, format: key.slice(slash + 1) } : undefined;
}

function isPosition(value: unknown): value is ReadingPosition {
  if (typeof value !== 'object' || value === null) return false;
  const { location, fraction, openedAt } = value as Record<string, unknown>;
  return (
    typeof location === 'string' &&
    typeof fraction === 'number' &&
    Number.isFinite(fraction) &&
    typeof openedAt === 'number' &&
    Number.isFinite(openedAt)
  );
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function load(): Store {
  const raw = readRaw();
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const store: Store = {};
    for (const [key, value] of Object.entries(parsed)) if (parseKey(key) && isPosition(value)) store[key] = value;
    return store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    if (Object.keys(store).length === 0) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(store));
  } catch {
    return;
  } finally {
    for (const listener of listeners) listener();
  }
}

function put(bookId: number, format: string, position: ReadingPosition): void {
  const store = load();
  const key = entryKey(bookId, format);
  delete store[key];
  store[key] = position;
  write(store);
}

export function loadPosition(bookId: number, format: string): ReadingPosition | undefined {
  return load()[entryKey(bookId, format)];
}

export function savePosition(bookId: number, format: string, { location, fraction }: Pick<ReadingPosition, 'location' | 'fraction'>): void {
  put(bookId, format, { location, fraction, openedAt: Date.now() });
}

export function touchPosition(bookId: number, format: string): void {
  const saved = loadPosition(bookId, format);
  if (saved) put(bookId, format, { ...saved, openedAt: Date.now() });
}

export function listPositions(): PositionEntry[] {
  const raw = readRaw();
  if (snapshot && snapshot.raw === raw) return snapshot.entries;
  const entries = Object.entries(load())
    .flatMap(([key, position]) => {
      const parsed = parseKey(key);
      return parsed ? [{ ...parsed, ...position }] : [];
    })
    .reverse()
    .sort((a, b) => b.openedAt - a.openedAt);
  snapshot = { raw, entries };
  return entries;
}

export function subscribePositions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function forgetPositions(keep: BookFormatKey[]): void {
  const kept = new Set(keep.map(({ bookId, format }) => entryKey(bookId, format)));
  const store = load();
  const next: Store = {};
  for (const [key, position] of Object.entries(store)) if (kept.has(key)) next[key] = position;
  if (Object.keys(next).length !== Object.keys(store).length) write(next);
}

export function forgetAllPositions(): void {
  write({});
}

export type PositionTracker = {
  relocate(position: Pick<ReadingPosition, 'location' | 'fraction'>): void;
  close(): void;
};

export function trackPosition(bookId: number, format: string): PositionTracker {
  touchPosition(bookId, format);
  let latest: Pick<ReadingPosition, 'location' | 'fraction'> | undefined;
  let unsaved = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (!unsaved || !latest) return;
    unsaved = false;
    savePosition(bookId, format, latest);
    timer = setTimeout(flush, SAVE_INTERVAL_MS);
  };
  return {
    relocate(position) {
      latest = position;
      unsaved = true;
      if (timer === undefined) flush();
    },
    close() {
      clearTimeout(timer);
      timer = undefined;
      if (latest) savePosition(bookId, format, latest);
    },
  };
}
