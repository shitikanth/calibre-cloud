import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { StorageAdapter } from '../storage/adapter.ts';
import { clearConnection, loadConnection, saveConnection, type Connection } from './connection.ts';

export type OpenStorage = (connection: Connection) => StorageAdapter;

type ConnectionState = {
  connection: Connection | undefined;
  storage: StorageAdapter | undefined;
  connect(connection: Connection): void;
  disconnect(): void;
};

const ConnectionContext = createContext<ConnectionState | undefined>(undefined);

export function ConnectionProvider({ openStorage, children }: { openStorage: OpenStorage; children: ReactNode }) {
  const [connection, setConnection] = useState(loadConnection);
  const storage = useMemo(() => connection && openStorage(connection), [connection, openStorage]);

  const connect = useCallback((next: Connection) => {
    saveConnection(next);
    setConnection(next);
    void navigator.storage?.persist?.().catch(() => false);
  }, []);
  const disconnect = useCallback(() => {
    clearConnection();
    setConnection(undefined);
  }, []);

  const value = useMemo(() => ({ connection, storage, connect, disconnect }), [connection, storage, connect, disconnect]);
  return <ConnectionContext value={value}>{children}</ConnectionContext>;
}

export function useConnection(): ConnectionState {
  const state = useContext(ConnectionContext);
  if (!state) throw new Error('useConnection must be used inside ConnectionProvider');
  return state;
}
