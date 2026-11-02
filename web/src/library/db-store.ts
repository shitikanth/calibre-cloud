import { registerFold } from './fold.ts';
import { loadSqlite, type Database } from './sqlite.ts';

const DIRECTORY = 'library';
const LEGACY_POOL_DIRECTORY = '.opfs-sahpool';
const LOCK_NAME = 'calibre-cloud:library-db';

type SyncAccessHandle = { write(data: Uint8Array): number; flush(): void; close(): void };
type WritableFileHandle = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncAccessHandle> };

export type LibraryDirectory = () => Promise<FileSystemDirectoryHandle | undefined>;

export type DbStore = {
  importDatabase(bytes: ArrayBuffer): Promise<{ db: Database; file: string | undefined }>;
  openStoredDatabase(file: string): Promise<Database | undefined>;
  forgetOtherDatabases(keep: string | undefined): Promise<void>;
  wipeDatabases(): Promise<void>;
};

export async function libraryDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(LEGACY_POOL_DIRECTORY, { recursive: true }).catch(() => undefined);
    return await root.getDirectoryHandle(DIRECTORY, { create: true });
  } catch {
    return undefined;
  }
}

export function createDbStore(directory: LibraryDirectory): DbStore {
  let opened: Promise<FileSystemDirectoryHandle | undefined> | undefined;
  const dir = () => (opened ??= directory());

  return {
    async importDatabase(bytes) {
      const db = await deserialize(new Uint8Array(bytes));
      const store = await dir();
      return { db, file: store && (await persist(store, bytes)) };
    },
    async openStoredDatabase(file) {
      const store = await dir();
      const bytes = store && (await readStored(store, file));
      return bytes && deserialize(new Uint8Array(bytes));
    },
    async forgetOtherDatabases(keep) {
      const store = await dir();
      if (!store) return;
      await withLock('exclusive', async () => {
        for await (const name of store.keys()) if (name !== keep) await store.removeEntry(name).catch(() => undefined);
      });
    },
    async wipeDatabases() {
      await this.forgetOtherDatabases(undefined);
    },
  };
}

async function persist(store: FileSystemDirectoryHandle, bytes: ArrayBuffer): Promise<string | undefined> {
  const file = `metadata-${crypto.randomUUID()}.db`;
  try {
    const handle = (await store.getFileHandle(file, { create: true })) as WritableFileHandle;
    const access = await handle.createSyncAccessHandle();
    try {
      if (access.write(new Uint8Array(bytes)) !== bytes.byteLength) throw new Error('Short write');
      access.flush();
    } finally {
      access.close();
    }
    return file;
  } catch {
    await store.removeEntry(file).catch(() => undefined);
    return undefined;
  }
}

function readStored(store: FileSystemDirectoryHandle, file: string): Promise<ArrayBuffer | undefined> {
  return withLock('shared', async () => {
    try {
      return await (await (await store.getFileHandle(file)).getFile()).arrayBuffer();
    } catch {
      return undefined;
    }
  });
}

function withLock<T>(mode: LockMode, run: () => Promise<T>): Promise<T> {
  if (!('locks' in navigator)) return run();
  return navigator.locks.request(LOCK_NAME, { mode }, run);
}

async function deserialize(data: Uint8Array): Promise<Database> {
  const sqlite3 = await loadSqlite();
  const { capi } = sqlite3;
  const db = new sqlite3.oo1.DB();
  const pointer = sqlite3.wasm.allocFromTypedArray(data);
  const flags = capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_READONLY;
  const rc = capi.sqlite3_deserialize(db, 'main', pointer, data.byteLength, data.byteLength, flags);
  try {
    db.checkRc(rc);
    db.exec('PRAGMA query_only = ON');
    registerFold(db);
    db.selectValue('SELECT count(*) FROM sqlite_schema');
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
