import type { StorageAdapter } from './adapter.ts';
import type { SignInProvider } from './sign-in.ts';

export type Connection = { readonly provider: string; readonly [setting: string]: unknown };

export type ProviderIdentity = { readonly id: string; readonly name: string; readonly icon: string };

export type ConnectForm = { hint: string; label: string; placeholder: string };

export type ParsedConnectInput = { ok: true; connection: Connection } | { ok: false; problem: string };

export interface LinkProvider extends ProviderIdentity {
  readonly kind: 'link';
  readonly connectForm: ConnectForm;
  parseConnectInput(input: string): ParsedConnectInput;
  connectInput?(connection: Connection): string;
  isConnection(value: unknown): value is Connection;
  open(connection: Connection): StorageAdapter;
}

export type StorageProvider = LinkProvider | SignInProvider;
