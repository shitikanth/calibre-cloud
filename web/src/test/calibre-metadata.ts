import type { Database } from '../library/sqlite.ts';
import type { BookSpec } from './calibre-library.ts';

export function insertMetadata(db: Database, bookId: number, book: BookSpec): void {
  if (book.publisher) link(db, bookId, 'publishers', 'books_publishers_link', 'publisher', book.publisher);
  for (const code of book.languages ?? []) link(db, bookId, 'languages', 'books_languages_link', 'lang_code', code);
  if (book.description !== undefined) {
    db.exec({ sql: 'INSERT INTO comments(book, text) VALUES (?, ?)', bind: [bookId, book.description] });
  }
}

function link(db: Database, bookId: number, table: string, linkTable: string, column: string, value: string) {
  const valueColumn = table === 'languages' ? 'lang_code' : 'name';
  db.exec({ sql: `INSERT OR IGNORE INTO ${table}(${valueColumn}) VALUES (?)`, bind: [value] });
  const id = db.selectValue(`SELECT id FROM ${table} WHERE ${valueColumn} = ?`, [value]);
  db.exec({ sql: `INSERT INTO ${linkTable}(book, ${column}) VALUES (?, ?)`, bind: [bookId, id] });
}
