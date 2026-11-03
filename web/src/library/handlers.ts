import { getBook } from './book-query.ts';
import { listBookFormats, listBooks, listCoverVersions } from './books-query.ts';
import type { DbStore } from './db-store.ts';
import type { LibraryOperations, LibraryRequest, LibraryResponse, Operation } from './protocol.ts';
import type { Database } from './sqlite.ts';

type Handlers = {
  [Op in Operation]: (args: LibraryOperations[Op]['args']) => Promise<LibraryOperations[Op]['result']> | LibraryOperations[Op]['result'];
};

export type LibraryHandler = (request: LibraryRequest) => Promise<LibraryResponse>;

export function createLibraryHandler(store: DbStore): LibraryHandler {
  let current: { db: Database; file: string | undefined } | undefined;

  function replaceDb(next: typeof current) {
    current?.db.close();
    current = next;
  }

  function requireDb(): Database {
    if (!current) throw new Error('No library is open');
    return current.db;
  }

  const handlers: Handlers = {
    async open({ bytes }) {
      const imported = await store.importDatabase(bytes);
      replaceDb(imported);
      await store.forgetOtherDatabases(imported.file);
      return imported.file ?? null;
    },
    async openStored({ file }) {
      if (current?.file === file) return 'unchanged';
      const db = await store.openStoredDatabase(file);
      if (!db) return 'missing';
      replaceDb({ db, file });
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

  return async (request) => {
    try {
      const handler = handlers[request.op] as (args: LibraryRequest) => unknown;
      return { id: request.id, ok: true, result: await handler(request) };
    } catch (error) {
      const { message } = error instanceof Error ? error : new Error(String(error));
      return { id: request.id, ok: false, error: { message } };
    }
  };
}
