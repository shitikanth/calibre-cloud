import type { StorageAdapter } from './adapter.ts';
import { megaProvider } from './mega/provider.ts';
import type { Connection, StorageProvider } from './provider.ts';

export const providers: readonly StorageProvider[] = [megaProvider];

export function readConnection(value: unknown): Connection | undefined {
  return providers.some((provider) => provider.isConnection(value)) ? (value as Connection) : undefined;
}

export function openStorage(connection: Connection): StorageAdapter {
  const provider = providers.find(({ id }) => id === connection.provider);
  if (!provider) throw new Error(`No storage provider called ${connection.provider}`);
  return provider.open(connection);
}
