import { expect, onTestFinished, test } from 'vitest';
import { createDbStore, libraryDirectory, type DbStore } from './db-store.ts';
import { buildCalibreLibrary } from '../test/calibre-library.ts';

async function libraryBytes(title: string): Promise<ArrayBuffer> {
  const { 'metadata.db': db } = await buildCalibreLibrary([{ title, authors: ['Charlotte Brontë'] }]);
  return (db as Uint8Array<ArrayBuffer>).slice().buffer;
}

async function scratchDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const name = `db-store-test-${crypto.randomUUID()}`;
  onTestFinished(() => root.removeEntry(name, { recursive: true }).catch(() => undefined));
  return root.getDirectoryHandle(name, { create: true });
}

async function writeFile(directory: FileSystemDirectoryHandle, name: string, bytes: ArrayBuffer): Promise<void> {
  const writable = await (await directory.getFileHandle(name, { create: true })).createWritable();
  await writable.write(bytes);
  await writable.close();
}

async function fileNames(directory: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const name of directory.keys()) names.push(name);
  return names.sort();
}

function titleIn(store: DbStore) {
  return async (file: string) => {
    const db = await store.openStoredDatabase(file);
    onTestFinished(() => db?.close());
    return db?.selectValue('SELECT title FROM books');
  };
}

test('with no directory, an imported database lives in memory only', async () => {
  const store = createDbStore(() => Promise.resolve(undefined));

  const { db, file } = await store.importDatabase(await libraryBytes('Jane Eyre'));
  onTestFinished(() => db.close());

  expect(file).toBeUndefined();
  expect(db.selectValue('SELECT title FROM books')).toBe('Jane Eyre');
  expect(await store.openStoredDatabase('metadata-x.db')).toBeUndefined();
  await store.forgetOtherDatabases(undefined);
  await store.wipeDatabases();
});

test('a directory that rejects the write still yields an in-memory database and leaves no file behind', async () => {
  const directory = await scratchDirectory();
  const store = createDbStore(() => Promise.resolve(directory));

  const { db, file } = await store.importDatabase(await libraryBytes('Jane Eyre'));
  onTestFinished(() => db.close());

  expect(file).toBeUndefined();
  expect(db.selectValue('SELECT title FROM books')).toBe('Jane Eyre');
  expect(await fileNames(directory)).toEqual([]);
});

test('a stored database opens from its file, a missing one does not', async () => {
  const directory = await scratchDirectory();
  await writeFile(directory, 'metadata-a.db', await libraryBytes('Jane Eyre'));
  const store = createDbStore(() => Promise.resolve(directory));

  expect(await titleIn(store)('metadata-a.db')).toBe('Jane Eyre');
  expect(await store.openStoredDatabase('metadata-b.db')).toBeUndefined();
  expect(await store.openStoredDatabase('/metadata-old-pool-name.db')).toBeUndefined();
});

test('a corrupt stored file is treated as missing', async () => {
  const directory = await scratchDirectory();
  await writeFile(directory, 'metadata-a.db', new TextEncoder().encode('not a database').slice().buffer);
  const store = createDbStore(() => Promise.resolve(directory));

  await expect(store.openStoredDatabase('metadata-a.db')).rejects.toThrow();
});

test('forgetting other databases keeps only the named file, and wiping removes it too', async () => {
  const directory = await scratchDirectory();
  await writeFile(directory, 'metadata-a.db', await libraryBytes('Jane Eyre'));
  await writeFile(directory, 'metadata-b.db', await libraryBytes('Shirley'));
  const store = createDbStore(() => Promise.resolve(directory));

  await store.forgetOtherDatabases('metadata-b.db');

  expect(await fileNames(directory)).toEqual(['metadata-b.db']);
  expect(await titleIn(store)('metadata-b.db')).toBe('Shirley');

  await store.wipeDatabases();

  expect(await fileNames(directory)).toEqual([]);
});

test('the library directory is created under OPFS and the legacy pool directory is removed', async () => {
  const root = await navigator.storage.getDirectory();
  const legacy = await root.getDirectoryHandle('.opfs-sahpool', { create: true });
  await writeFile(legacy, 'pool-file', new ArrayBuffer(8));

  const directory = await libraryDirectory();

  expect(directory?.name).toBe('library');
  await expect(root.getDirectoryHandle('.opfs-sahpool')).rejects.toThrow();
});
