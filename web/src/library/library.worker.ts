import { IN_MEMORY_WORKER_NAME, type LibraryOperations, type LibraryRequest, type LibraryResponse, type Operation } from './protocol.ts';
import { getBook } from './book-query.ts';
import { listBookFormats, listBooks, listCoverVersions } from './books-query.ts';
import { createDbStore, libraryDirectory } from './db-store.ts';
import type { Database } from './sqlite.ts';

const store = createDbStore(self.name === IN_MEMORY_WORKER_NAME ? async () => undefined : libraryDirectory);

let db: Database | undefined;
let openFile: string | undefined;

type Handlers = {
  [Op in Operation]: (args: LibraryOperations[Op]['args']) => Promise<LibraryOperations[Op]['result']> | LibraryOperations[Op]['result'];
};

const handlers: Handlers = {
  async open({ bytes }) {
    const imported = await store.importDatabase(bytes);
    replaceDb(imported.db, imported.file);
    await store.forgetOtherDatabases(imported.file);
    return imported.file ?? null;
  },
  async openStored({ file }) {
    if (db && file === openFile) return 'unchanged';
    const stored = await store.openStoredDatabase(file);
    await store.forgetOtherDatabases(stored && file);
    if (!stored) return 'missing';
    replaceDb(stored, file);
    return 'opened';
  },
  async clear() {
    replaceDb(undefined);
    await store.wipeDatabases();
  },
  close() {
    replaceDb(undefined);
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

function replaceDb(next: Database | undefined, file?: string) {
  db?.close();
  db = next;
  openFile = file;
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
    const { message } = error instanceof Error ? error : new Error(String(error));
    return { id: request.id, ok: false, error: { message } };
  }
}

let queue = Promise.resolve();

self.onmessage = ({ data: request }: MessageEvent<LibraryRequest>) => {
  queue = queue.then(async () => self.postMessage(await handle(request)));
};
