import { LibraryInUse } from './errors.ts';
import { loadSqlite, type Database, type Sqlite3 } from './sqlite.ts';

type Pool = Awaited<ReturnType<Sqlite3['installOpfsSAHPoolVfs']>>;

const LOCK_NAME = 'calibre-cloud:library-db';
const LOCK_WAIT_MS = 2_000;

let pool: Promise<Pool | undefined> | undefined;
let releaseLock: (() => void) | undefined;

export function openPool(): Promise<Pool | undefined> {
  pool ??= acquirePool().catch((error: unknown) => {
    pool = undefined;
    throw error;
  });
  return pool;
}

async function acquirePool(): Promise<Pool | undefined> {
  await acquireLock();
  const sqlite3 = await loadSqlite();
  try {
    return await sqlite3.installOpfsSAHPoolVfs({ preserveOnInitFailure: true });
  } catch {
    return undefined;
  }
}

function acquireLock(): Promise<void> {
  return new Promise((acquired, failed) => {
    navigator.locks
      .request(LOCK_NAME, { signal: AbortSignal.timeout(LOCK_WAIT_MS) }, () => {
        acquired();
        return new Promise<void>((release) => (releaseLock = release));
      })
      .catch(() => failed(new LibraryInUse('Library is open in another tab')));
  });
}

export async function releasePool(): Promise<void> {
  const held = await pool?.catch(() => undefined);
  if (held && !held.isPaused()) await held.pauseVfs();
  pool = undefined;
  releaseLock?.();
  releaseLock = undefined;
}

export async function importDatabase(bytes: ArrayBuffer): Promise<{ db: Database; file: string | undefined }> {
  const store = await openPool();
  if (!store) return { db: await deserialize(new Uint8Array(bytes)), file: undefined };
  const file = `/metadata-${crypto.randomUUID()}.db`;
  store.importDb(file, bytes);
  try {
    return { db: openReadOnly(store, file), file };
  } catch (error) {
    store.unlink(file);
    throw error;
  }
}

export async function openStoredDatabase(file: string): Promise<Database | undefined> {
  const store = await openPool();
  if (!store?.getFileNames().includes(file)) return undefined;
  return openReadOnly(store, file);
}

export async function forgetOtherDatabases(keep: string | undefined): Promise<void> {
  const store = await openPool();
  for (const name of store?.getFileNames() ?? []) if (name !== keep) store?.unlink(name);
}

export async function wipeDatabases(): Promise<void> {
  await (await openPool())?.wipeFiles();
}

function openReadOnly(store: Pool, file: string): Database {
  return verified(new store.OpfsSAHPoolDb(file));
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
  } catch (error) {
    db.close();
    throw error;
  }
  return verified(db);
}

function verified(db: Database): Database {
  try {
    db.exec('PRAGMA query_only = ON');
    db.selectValue('SELECT count(*) FROM sqlite_schema');
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
