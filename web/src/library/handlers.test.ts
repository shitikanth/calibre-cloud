import { expect, onTestFinished, test } from 'vitest';
import { createDbStore } from './db-store.ts';
import { createLibraryHandler, type LibraryHandler } from './handlers.ts';
import type { LibraryOperations, LibraryRequest, Operation } from './protocol.ts';
import { buildCalibreLibrary } from '../test/calibre-library.ts';

function request<Op extends Operation>(id: number, op: Op, args: LibraryOperations[Op]['args']): LibraryRequest {
  return { id, op, ...args } as LibraryRequest;
}

async function libraryBytes(): Promise<ArrayBuffer> {
  const { 'metadata.db': db } = await buildCalibreLibrary([
    { title: 'Jane Eyre', authors: ['Charlotte Brontë'], hasCover: true, formats: { EPUB: 'epub' } },
  ]);
  return (db as Uint8Array<ArrayBuffer>).slice().buffer;
}

function inMemoryHandler(): LibraryHandler {
  const handle = createLibraryHandler(createDbStore(() => Promise.resolve(undefined)));
  onTestFinished(async () => {
    await handle(request(0, 'close', {}));
  });
  return handle;
}

async function scratchDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const name = `handlers-test-${crypto.randomUUID()}`;
  onTestFinished(() => root.removeEntry(name, { recursive: true }).catch(() => undefined));
  return root.getDirectoryHandle(name, { create: true });
}

test('an opened library answers the book queries', async () => {
  const handle = inMemoryHandler();

  expect(await handle(request(1, 'open', { bytes: await libraryBytes() }))).toEqual({ id: 1, ok: true, result: null });

  expect(await handle(request(2, 'countBooks', {}))).toEqual({ id: 2, ok: true, result: 1 });
  const books = await handle(request(3, 'listBooks', { offset: 0, limit: 10 }));
  expect(books).toMatchObject({ id: 3, ok: true, result: [{ id: 1, title: 'Jane Eyre', authors: ['Charlotte Brontë'] }] });
  expect(await handle(request(4, 'getBook', { bookId: 1 }))).toMatchObject({ ok: true, result: { title: 'Jane Eyre' } });
  expect(await handle(request(5, 'getBook', { bookId: 99 }))).toEqual({ id: 5, ok: true, result: null });
  expect(await handle(request(6, 'listCoverVersions', {}))).toMatchObject({ ok: true, result: [{ bookId: 1 }] });
  expect(await handle(request(7, 'listBookFormats', {}))).toEqual({ id: 7, ok: true, result: [{ bookId: 1, format: 'EPUB' }] });
});

test('queries before a library is open, and after close or clear, fail with a message', async () => {
  const handle = inMemoryHandler();

  expect(await handle(request(1, 'countBooks', {}))).toEqual({ id: 1, ok: false, error: { message: 'No library is open' } });

  await handle(request(2, 'open', { bytes: await libraryBytes() }));
  await handle(request(3, 'close', {}));
  expect(await handle(request(4, 'countBooks', {}))).toMatchObject({ ok: false });

  await handle(request(5, 'open', { bytes: await libraryBytes() }));
  expect(await handle(request(6, 'clear', {}))).toEqual({ id: 6, ok: true, result: undefined });
  expect(await handle(request(7, 'countBooks', {}))).toMatchObject({ ok: false });
});

test('bytes that are not a database are refused', async () => {
  const handle = inMemoryHandler();

  const response = await handle(request(1, 'open', { bytes: new TextEncoder().encode('nope').slice().buffer }));

  expect(response).toMatchObject({ id: 1, ok: false });
});

test('a stored file opens once and is unchanged after that, a missing one is reported', async () => {
  const directory = await scratchDirectory();
  const writable = await (await directory.getFileHandle('metadata-a.db', { create: true })).createWritable();
  await writable.write(await libraryBytes());
  await writable.close();
  const handle = createLibraryHandler(createDbStore(() => Promise.resolve(directory)));
  onTestFinished(async () => {
    await handle(request(0, 'close', {}));
  });

  expect(await handle(request(1, 'openStored', { file: 'metadata-a.db' }))).toEqual({ id: 1, ok: true, result: 'opened' });
  expect(await handle(request(2, 'openStored', { file: 'metadata-a.db' }))).toEqual({ id: 2, ok: true, result: 'unchanged' });
  expect(await handle(request(3, 'countBooks', {}))).toEqual({ id: 3, ok: true, result: 1 });
  expect(await handle(request(4, 'openStored', { file: 'metadata-b.db' }))).toEqual({ id: 4, ok: true, result: 'missing' });
  expect(await handle(request(5, 'countBooks', {}))).toEqual({ id: 5, ok: true, result: 1 });
});
