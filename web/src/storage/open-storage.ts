import type { Connection } from '../connection/connection.ts';
import type { StorageAdapter } from './adapter.ts';
import { createMegaAdapter } from './mega/adapter.ts';

export function openStorage(connection: Connection): StorageAdapter {
  return createMegaAdapter(connection.link);
}
