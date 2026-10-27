import type { StorageAdapter } from './adapter.ts';
import { megaProvider } from './mega/provider.ts';
import type { Connection, ParsedConnectInput, StorageProvider } from './provider.ts';

export const providers: readonly StorageProvider[] = [megaProvider];

export type ResolvedConnectInput = { provider: StorageProvider; parsed: ParsedConnectInput };

export function resolveConnectInput(input: string): ResolvedConnectInput {
  const attempts = providers.map((provider) => ({ provider, parsed: provider.parseConnectInput(input) }));
  return attempts.find(({ parsed }) => parsed.ok) ?? attempts[0]!;
}

export function readConnection(value: unknown): Connection | undefined {
  return providers.some((provider) => provider.isConnection(value)) ? (value as Connection) : undefined;
}

export function openStorage(connection: Connection): StorageAdapter {
  const provider = providers.find(({ id }) => id === connection.provider);
  if (!provider) throw new Error(`No storage provider called ${connection.provider}`);
  return provider.open(connection);
}
