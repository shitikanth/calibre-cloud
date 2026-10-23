import { loadSqlite } from '../library/sqlite.ts';

const CALIBRE_SUBSET_DDL = `
CREATE TABLE books ( id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT 'Unknown' COLLATE NOCASE,
  sort TEXT COLLATE NOCASE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  pubdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  series_index REAL NOT NULL DEFAULT 1.0,
  author_sort TEXT COLLATE NOCASE,
  path TEXT NOT NULL DEFAULT '',
  uuid TEXT,
  has_cover BOOL DEFAULT 0,
  last_modified TIMESTAMP NOT NULL DEFAULT '2000-01-01 00:00:00+00:00');
CREATE TABLE authors ( id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, sort TEXT COLLATE NOCASE, link TEXT NOT NULL DEFAULT '', UNIQUE(name));
CREATE TABLE books_authors_link ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, author INTEGER NOT NULL, UNIQUE(book, author));
CREATE TABLE series ( id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, sort TEXT COLLATE NOCASE, link TEXT NOT NULL DEFAULT '', UNIQUE (name));
CREATE TABLE books_series_link ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, series INTEGER NOT NULL, UNIQUE(book));
CREATE TABLE tags ( id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, link TEXT NOT NULL DEFAULT '', UNIQUE (name));
CREATE TABLE books_tags_link ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, tag INTEGER NOT NULL, UNIQUE(book, tag));
CREATE TABLE publishers ( id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, sort TEXT COLLATE NOCASE, link TEXT NOT NULL DEFAULT '', UNIQUE(name));
CREATE TABLE books_publishers_link ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, publisher INTEGER NOT NULL, UNIQUE(book));
CREATE TABLE languages ( id INTEGER PRIMARY KEY, lang_code TEXT NOT NULL COLLATE NOCASE, link TEXT NOT NULL DEFAULT '', UNIQUE(lang_code));
CREATE TABLE books_languages_link ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, lang_code INTEGER NOT NULL, item_order INTEGER NOT NULL DEFAULT 0, UNIQUE(book, lang_code));
CREATE TABLE comments ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, text TEXT NOT NULL COLLATE NOCASE, UNIQUE(book));
CREATE TABLE data ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, format TEXT NOT NULL COLLATE NOCASE, uncompressed_size INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE(book, format));
PRAGMA application_id = 0x63616c69;
PRAGMA user_version = 28;
`;

export type BookSpec = {
  title: string;
  authors?: string[];
  added?: string;
  hasCover?: boolean;
  formats?: Record<string, string>;
};

export type FakeLibraryFiles = Record<string, Uint8Array<ArrayBuffer> | string>;

export async function buildCalibreLibrary(books: BookSpec[]): Promise<FakeLibraryFiles> {
  const sqlite3 = await loadSqlite();
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  const files: FakeLibraryFiles = {};
  try {
    db.exec(CALIBRE_SUBSET_DDL);
    const authorIds = new Map<string, number>();
    for (const [index, book] of books.entries()) {
      const id = index + 1;
      const authors = book.authors ?? ['Unknown'];
      const path = `${ascii(authors[0] ?? 'Unknown')}/${ascii(book.title)} (${id})`;
      const added = book.added ?? `2024-01-${String((id % 28) + 1).padStart(2, '0')} 10:00:00+00:00`;
      db.exec({
        sql: `INSERT INTO books(id, title, sort, timestamp, author_sort, path, uuid, has_cover, last_modified)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [id, book.title, book.title, added, authors.join(' & '), path, `uuid-${id}`, book.hasCover ? 1 : 0, added],
      });
      for (const name of authors) {
        if (!authorIds.has(name)) {
          authorIds.set(name, authorIds.size + 1);
          db.exec({ sql: 'INSERT INTO authors(id, name, sort) VALUES (?, ?, ?)', bind: [authorIds.get(name)!, name, name] });
        }
        db.exec({ sql: 'INSERT INTO books_authors_link(book, author) VALUES (?, ?)', bind: [id, authorIds.get(name)!] });
      }
      if (book.hasCover) files[`${path}/cover.jpg`] = `cover of ${book.title}`;
      const stem = ascii(`${book.title} - ${authors[0] ?? 'Unknown'}`);
      for (const [format, content] of Object.entries(book.formats ?? {})) {
        db.exec({
          sql: 'INSERT INTO data(book, format, uncompressed_size, name) VALUES (?, ?, ?, ?)',
          bind: [id, format.toUpperCase(), content.length, stem],
        });
        files[`${path}/${stem}.${format.toLowerCase()}`] = content;
      }
    }
    files['metadata.db'] = sqlite3.capi.sqlite3_js_db_export(db) as Uint8Array<ArrayBuffer>;
  } finally {
    db.close();
  }
  return files;
}

function ascii(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\x20-\x7e]/g, '_');
}
