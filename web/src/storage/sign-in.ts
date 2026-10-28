import type { StorageAdapter } from './adapter.ts';
import type { Connection } from './provider.ts';

export type AccessTokens = { get(options?: { refresh?: boolean }): Promise<string> };

export type LibraryCandidate = { root: string; path: string };

export type FolderEntry = { id: string; name: string };

export interface LibraryFinder {
  findLibraries(signal?: AbortSignal): Promise<LibraryCandidate[]>;
  listFolder(folder: string | undefined, signal?: AbortSignal): Promise<FolderEntry[]>;
}

export interface SignInProvider {
  readonly kind: 'sign-in';
  readonly id: string;
  readonly name: string;
  readonly startPath: string;
  connectionFor(root: string): Connection;
  isConnection(value: unknown): value is Connection;
  libraryFinder(tokens: AccessTokens): LibraryFinder;
  open(connection: Connection, tokens: AccessTokens): StorageAdapter;
}
