import { Aborted, type StorageAdapter, type StorageError } from '../storage/adapter.ts';
import type { Connection } from '../storage/provider.ts';
import type { AccessTokens, FolderEntry, LibraryCandidate, LibraryFinder, SignInProvider } from '../storage/sign-in.ts';

export type FakeFolder = { id: string; name: string; folders?: FakeFolder[] };

export type FakeSignInOptions = {
  storage: StorageAdapter;
  id?: string;
  name?: string;
  libraries?: LibraryCandidate[];
  folders?: FakeFolder[];
};

export type FakeSignInProvider = SignInProvider & {
  libraries: LibraryCandidate[];
  folders: FakeFolder[];
  readonly finderCalls: string[];
  failFindingWith(error: StorageError | undefined): void;
  holdNextSearch(): { readonly started: Promise<void>; release(): void };
};

export function fakeSignInProvider({
  storage,
  id = 'fake',
  name = 'Fake Drive',
  libraries = [],
  folders = [],
}: FakeSignInOptions): FakeSignInProvider {
  let failure: StorageError | undefined;
  let hold: { started: () => void; released: Promise<void> } | undefined;
  const finderCalls: string[] = [];

  const isConnection = (value: unknown): value is Connection => {
    if (typeof value !== 'object' || value === null) return false;
    const { provider, root } = value as Record<string, unknown>;
    return provider === id && typeof root === 'string';
  };

  const childrenOf = (folder: string | undefined): FakeFolder[] | undefined => {
    if (folder === undefined) return provider.folders;
    const queue = [...provider.folders];
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (next.id === folder) return next.folders ?? [];
      queue.push(...(next.folders ?? []));
    }
    return undefined;
  };

  const provider: FakeSignInProvider = {
    kind: 'sign-in',
    id,
    name,
    startPath: `/api/auth/${id}/start`,
    libraries,
    folders,
    finderCalls,
    connectionFor: (root) => ({ provider: id, root }),
    isConnection,
    libraryFinder(tokens: AccessTokens): LibraryFinder {
      return {
        async findLibraries(signal) {
          finderCalls.push('findLibraries');
          await tokens.get();
          const held = hold;
          hold = undefined;
          if (held) {
            held.started();
            await held.released;
          }
          if (signal?.aborted) throw new Aborted();
          if (failure) throw failure;
          return provider.libraries;
        },
        async listFolder(folder) {
          finderCalls.push(`listFolder ${folder ?? '(top)'}`);
          await tokens.get();
          if (failure) throw failure;
          return (childrenOf(folder) ?? []).map(({ id: folderId, name: folderName }): FolderEntry => ({
            id: folderId,
            name: folderName,
          }));
        },
      };
    },
    open(connection, tokens) {
      if (!isConnection(connection)) throw new Error(`Not a ${name} connection`);
      return {
        async stat(path) {
          await tokens.get();
          return storage.stat(path);
        },
        async read(path, options) {
          await tokens.get();
          return storage.read(path, options);
        },
      };
    },
    failFindingWith(error) {
      failure = error;
    },
    holdNextSearch() {
      let started!: () => void;
      let release!: () => void;
      const startedPromise = new Promise<void>((resolve) => (started = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      hold = { started, released };
      return { started: startedPromise, release };
    },
  };
  return provider;
}
