import type { Connection } from '../storage/provider.ts';
import { readConnection } from '../storage/providers.ts';

export type { Connection };

const storageKey = 'calibre-cloud:connection';

export function loadConnection(): Connection | undefined {
  try {
    return readConnection(JSON.parse(localStorage.getItem(storageKey) ?? 'null'));
  } catch {
    return undefined;
  }
}

export function saveConnection(connection: Connection): void {
  localStorage.setItem(storageKey, JSON.stringify(connection));
}

export function sameConnection(a: Connection, b: Connection): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

export function clearConnection(): void {
  localStorage.removeItem(storageKey);
}
