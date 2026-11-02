import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { StorageAdapter } from '../storage/adapter.ts';
import type { Providers } from '../storage/providers.ts';
import { clearConnection, loadConnection, saveConnection, type Connection } from './connection.ts';

type ConnectionState = {
  connection: Connection | undefined;
  lastDisconnected: Connection | undefined;
  storage: StorageAdapter | undefined;
  connect(connection: Connection): void;
  disconnect(): void;
};

type CurrentAndLast = { connection: Connection | undefined; lastDisconnected: Connection | undefined };

const ConnectionContext = createContext<ConnectionState | undefined>(undefined);
const ProvidersContext = createContext<Providers | undefined>(undefined);

export function ConnectionProvider({ providers, children }: { providers: Providers; children: ReactNode }) {
  const [{ connection, lastDisconnected }, setCurrentAndLast] = useState<CurrentAndLast>(() => ({
    connection: loadConnection(providers.readConnection),
    lastDisconnected: undefined,
  }));
  const storage = useMemo(() => connection && providers.openStorage(connection), [connection, providers]);

  const connect = useCallback((next: Connection) => {
    saveConnection(next);
    setCurrentAndLast({ connection: next, lastDisconnected: undefined });
    void navigator.storage?.persist?.().catch(() => false);
  }, []);
  const disconnect = useCallback(() => {
    clearConnection();
    setCurrentAndLast((current) => ({ connection: undefined, lastDisconnected: current.connection }));
  }, []);

  const value = useMemo(
    () => ({ connection, lastDisconnected, storage, connect, disconnect }),
    [connection, lastDisconnected, storage, connect, disconnect],
  );
  return (
    <ProvidersContext value={providers}>
      <ConnectionContext value={value}>{children}</ConnectionContext>
    </ProvidersContext>
  );
}

export function useConnection(): ConnectionState {
  const state = useContext(ConnectionContext);
  if (!state) throw new Error('useConnection must be used inside ConnectionProvider');
  return state;
}

export function useProviders(): Providers {
  const providers = useContext(ProvidersContext);
  if (!providers) throw new Error('useProviders must be used inside ConnectionProvider');
  return providers;
}
