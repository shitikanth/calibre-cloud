import type { StorageAdapter } from './adapter.ts';
import type { Connection, ProviderIdentity } from './provider.ts';

export type AccessTokens = { get(options?: { refresh?: boolean }): Promise<string> };

export type LibraryCandidate = { root: string; path: string };

export type FolderEntry = { id: string; name: string };

export interface LibraryFinder {
  findLibraries(signal?: AbortSignal): Promise<LibraryCandidate[]>;
  listFolder(folder: string | undefined, signal?: AbortSignal): Promise<FolderEntry[]>;
}

export interface SignInProvider extends ProviderIdentity {
  readonly kind: 'sign-in';
  readonly startPath: string;
  connectionFor(root: string): Connection;
  isConnection(value: unknown): value is Connection;
  libraryFinder(tokens: AccessTokens): LibraryFinder;
  open(connection: Connection, tokens: AccessTokens): StorageAdapter;
}
