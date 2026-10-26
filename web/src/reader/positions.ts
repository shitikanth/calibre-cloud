import type { BookFormatKey } from '../library/protocol.ts';

export type ReadingPosition = { location: string; fraction: number };

export type StoredPosition = ReadingPosition & { openedAt: number };

export type PositionEntry = BookFormatKey & StoredPosition;

const storageKey = 'calibre-cloud:positions';

const SAVE_INTERVAL_MS = 1_000;

type Store = Record<string, StoredPosition>;

const listeners = new Set<() => void>();

let snapshot: { raw: string | null; entries: PositionEntry[] } | undefined;

function entryKey({ bookId, format }: BookFormatKey): string {
  return `${bookId}/${format}`;
}

function parseKey(key: string): BookFormatKey | undefined {
  const slash = key.indexOf('/');
  if (slash < 1) return undefined;
  const bookId = Number(key.slice(0, slash));
  return Number.isInteger(bookId) ? { bookId, format: key.slice(slash + 1) } : undefined;
}

function isStoredPosition(value: unknown): value is StoredPosition {
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
    for (const [key, value] of Object.entries(parsed)) if (parseKey(key) && isStoredPosition(value)) store[key] = value;
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

function now(store: Store): number {
  return Math.max(Date.now(), ...Object.values(store).map(({ openedAt }) => openedAt + 1));
}

export function loadPosition(key: BookFormatKey): StoredPosition | undefined {
  return load()[entryKey(key)];
}

export function savePosition(key: BookFormatKey, { location, fraction }: ReadingPosition): void {
  const store = load();
  const openedAt = store[entryKey(key)]?.openedAt ?? now(store);
  store[entryKey(key)] = { location, fraction, openedAt };
  write(store);
}

export function touchPosition(key: BookFormatKey): void {
  const store = load();
  const saved = store[entryKey(key)];
  if (!saved) return;
  store[entryKey(key)] = { ...saved, openedAt: now(store) };
  write(store);
}

export function listPositions(): PositionEntry[] {
  const raw = readRaw();
  if (snapshot && snapshot.raw === raw) return snapshot.entries;
  const entries = Object.entries(load())
    .flatMap(([key, position]) => {
      const parsed = parseKey(key);
      return parsed ? [{ ...parsed, ...position }] : [];
    })
    .sort((a, b) => b.openedAt - a.openedAt);
  snapshot = { raw, entries };
  return entries;
}

export function subscribePositions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function forgetPositions(keep: BookFormatKey[]): void {
  const kept = new Set(keep.map(entryKey));
  const store = load();
  const next: Store = {};
  for (const [key, position] of Object.entries(store)) if (kept.has(key)) next[key] = position;
  if (Object.keys(next).length !== Object.keys(store).length) write(next);
}

export function forgetAllPositions(): void {
  write({});
}

export type PositionTracker = {
  relocate(position: ReadingPosition): void;
  close(): void;
};

export function trackPosition(key: BookFormatKey): PositionTracker {
  touchPosition(key);
  let latest: ReadingPosition | undefined;
  let unsaved = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (!unsaved || !latest) return;
    unsaved = false;
    savePosition(key, latest);
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
      if (latest) savePosition(key, latest);
    },
  };
}
