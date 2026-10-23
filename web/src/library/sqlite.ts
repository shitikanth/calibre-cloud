import './sqlite-config.ts';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

export type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
export type Database = InstanceType<Sqlite3['oo1']['DB']>;

let sqlite3: Promise<Sqlite3> | undefined;

export function loadSqlite(): Promise<Sqlite3> {
  sqlite3 ??= sqlite3InitModule();
  return sqlite3;
}
