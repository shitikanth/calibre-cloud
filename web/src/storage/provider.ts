import type { StorageAdapter } from './adapter.ts';

export type Connection = { readonly provider: string; readonly [setting: string]: unknown };

export type ConnectForm = { name: string; label: string; placeholder: string };

export type ParsedConnectInput = { ok: true; connection: Connection } | { ok: false; problem: string };

export interface StorageProvider {
  readonly id: string;
  readonly connectForm: ConnectForm;
  parseConnectInput(input: string): ParsedConnectInput;
  connectInput?(connection: Connection): string;
  isConnection(value: unknown): value is Connection;
  open(connection: Connection): StorageAdapter;
}
