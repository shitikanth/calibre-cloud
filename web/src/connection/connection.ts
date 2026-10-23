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

export function clearConnection(): void {
  localStorage.removeItem(storageKey);
}
