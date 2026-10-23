import type { LibraryOperations, LibraryRequest, LibraryResponse, Operation } from './protocol.ts';
import { getBook } from './book-query.ts';
import { listBooks } from './books-query.ts';
import { registerFold } from './fold.ts';
import { loadSqlite, type Database } from './sqlite.ts';

let db: Database | undefined;

type Handlers = {
  [Op in Operation]: (args: LibraryOperations[Op]['args']) => Promise<LibraryOperations[Op]['result']> | LibraryOperations[Op]['result'];
};

const handlers: Handlers = {
  async open({ bytes }) {
    const sqlite3 = await loadSqlite();
    db?.close();
    db = undefined;
    const data = new Uint8Array(bytes);
    const pointer = sqlite3.wasm.allocFromTypedArray(data);
    const opened = new sqlite3.oo1.DB();
    const { capi } = sqlite3;
    const rc = capi.sqlite3_deserialize(
      opened,
      'main',
      pointer,
      data.byteLength,
      data.byteLength,
      capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_READONLY,
    );
    try {
      opened.checkRc(rc);
      opened.exec('PRAGMA query_only = ON');
      registerFold(opened);
      opened.selectValue('SELECT count(*) FROM sqlite_schema');
    } catch (error) {
      opened.close();
      throw error;
    }
    db = opened;
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
};

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
