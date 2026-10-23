import type { LibraryOperations, LibraryRequest, LibraryResponse, Operation } from './protocol.ts';
import { getBook } from './book-query.ts';
import { listBookFormats, listBooks, listCoverVersions } from './books-query.ts';
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
  getBook({ bookId }) {
    return getBook(requireDb(), bookId);
  },
  listCoverVersions() {
    return listCoverVersions(requireDb());
  },
  listBookFormats() {
    return listBookFormats(requireDb());
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

async function handle(request: LibraryRequest): Promise<LibraryResponse> {
  try {
    const handler = handlers[request.op] as (args: LibraryRequest) => unknown;
    return { id: request.id, ok: true, result: await handler(request) };
  } catch (error) {
    const { name, message } = error instanceof Error ? error : new Error(String(error));
    return { id: request.id, ok: false, error: { name, message } };
  }
}

let queue = Promise.resolve();

self.onmessage = ({ data: request }: MessageEvent<LibraryRequest>) => {
  queue = queue.then(async () => self.postMessage(await handle(request)));
};
