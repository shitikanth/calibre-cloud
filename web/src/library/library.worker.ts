import type { LibraryOperations, LibraryRequest, LibraryResponse, Operation } from './protocol.ts';
import { listBooks } from './books-query.ts';
import { forgetOtherDatabases, importDatabase, openStoredDatabase, releasePool, wipeDatabases } from './db-store.ts';
import type { Database } from './sqlite.ts';

let db: Database | undefined;

type Handlers = {
  [Op in Operation]: (args: LibraryOperations[Op]['args']) => Promise<LibraryOperations[Op]['result']> | LibraryOperations[Op]['result'];
};

const handlers: Handlers = {
  async open({ bytes }) {
    const imported = await importDatabase(bytes);
    replaceDb(imported.db);
    await forgetOtherDatabases(imported.file);
    return imported.file ?? null;
  },
  async openStored({ file }) {
    const stored = await openStoredDatabase(file);
    await forgetOtherDatabases(stored && file);
    if (!stored) return false;
    replaceDb(stored);
    return true;
  },
  async clear() {
    replaceDb(undefined);
    await wipeDatabases();
  },
  async close() {
    replaceDb(undefined);
    await releasePool();
  },
  countBooks() {
    return Number(requireDb().selectValue('SELECT count(*) FROM books'));
  },
  listBooks(page) {
    return listBooks(requireDb(), page);
  },
};

function replaceDb(next: Database | undefined) {
  db?.close();
  db = next;
}

function requireDb(): Database {
  if (!db) throw new Error('No library is open');
  return db;
}

self.onmessage = async ({ data: request }: MessageEvent<LibraryRequest>) => {
  let response: LibraryResponse;
  try {
    const handler = handlers[request.op] as (args: LibraryRequest) => unknown;
    response = { id: request.id, ok: true, result: await handler(request) };
  } catch (error) {
    const { name, message } = error instanceof Error ? error : new Error(String(error));
    response = { id: request.id, ok: false, error: { name, message } };
  }
  self.postMessage(response);
};
