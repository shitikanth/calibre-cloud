import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NotFound, ReconnectRequired } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { FakeDropbox } from './fake-dropbox.ts';
import { dropboxProvider } from './provider.ts';

let dropbox: FakeDropbox;

beforeEach(() => {
  dropbox = new FakeDropbox([
    { path: '/Books/Fiction/metadata.db', content: 'db' },
    { path: '/Books/Poetry/metadata.db', content: 'db' },
    { path: '/Calibre Library/metadata.db', content: 'db' },
    { path: '/Calibre Library/Jane Austen/Emma (12)/metadata.opf', content: 'opf' },
    { path: '/Backups/metadata.db.bak', content: 'old' },
    { path: '/Émile/Bibliothèque/metadata.db', content: 'db' },
    { path: '/notes.txt', content: 'not a folder' },
    { path: '/Archive', },
  ]);
  vi.stubGlobal('fetch', dropbox.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function finder(get: AccessTokens['get'] = () => Promise.resolve('token')) {
  return dropboxProvider.libraryFinder({ get });
}

describe('findLibraries', () => {
  test('lists every folder holding metadata.db by its path, with its lower-case path as the root', async () => {
    await expect(finder().findLibraries()).resolves.toEqual([
      { root: '/books/fiction', path: '/Books/Fiction' },
      { root: '/books/poetry', path: '/Books/Poetry' },
      { root: '/calibre library', path: '/Calibre Library' },
      { root: '/émile/bibliothèque', path: '/Émile/Bibliothèque' },
    ]);
  });

  test('searches file names only', async () => {
    await finder().findLibraries();

    expect(dropbox.requestsTo('files/search_v2').map(({ arg }) => arg)).toEqual([
      { query: 'metadata.db', options: { filename_only: true, max_results: 1000 } },
    ]);
  });

  test('reads every page of search results', async () => {
    dropbox.maxPageSize = 2;

    await expect(finder().findLibraries()).resolves.toHaveLength(4);
    expect(dropbox.requestsTo('files/search/continue_v2')).toHaveLength(2);
  });

  test('lists a library at the top of the Dropbox', async () => {
    dropbox.add({ path: '/metadata.db', content: 'db' });

    await expect(finder().findLibraries()).resolves.toContainEqual({ root: '', path: '/' });
  });

  test('a library found by search opens', async () => {
    const [found] = await finder().findLibraries();
    const storage = dropboxProvider.open(dropboxProvider.connectionFor(found!.root), { get: () => Promise.resolve('token') });

    await expect(storage.stat('metadata.db')).resolves.toMatchObject({ size: 2 });
  });

  test('misses a library the search index has not caught up with', async () => {
    dropbox = new FakeDropbox([{ path: '/New Library/metadata.db', content: 'db', unindexed: true }]);
    vi.stubGlobal('fetch', dropbox.fetch);

    await expect(finder().findLibraries()).resolves.toEqual([]);
  });

  test('passes on a storage error', async () => {
    const error = new ReconnectRequired('grant revoked');

    await expect(finder(() => Promise.reject(error)).findLibraries()).rejects.toBe(error);
  });
});

describe('listFolder', () => {
  test('starts at the top of the Dropbox, listing folders only, by name', async () => {
    await expect(finder().listFolder(undefined)).resolves.toEqual([
      { id: '/archive', name: 'Archive' },
      { id: '/backups', name: 'Backups' },
      { id: '/books', name: 'Books' },
      { id: '/calibre library', name: 'Calibre Library' },
      { id: '/émile', name: 'Émile' },
    ]);
    expect(dropbox.requestsTo('files/list_folder').map(({ arg }) => arg)).toEqual([{ path: '' }]);
  });

  test('opens a folder by its id', async () => {
    const top = await finder().listFolder(undefined);
    const books = top.find(({ name }) => name === 'Books')!;

    await expect(finder().listFolder(books.id)).resolves.toEqual([
      { id: '/books/fiction', name: 'Fiction' },
      { id: '/books/poetry', name: 'Poetry' },
    ]);
  });

  test('sorts folders by name, ignoring case', async () => {
    dropbox.add({ path: '/Books/zeta' });
    dropbox.add({ path: '/Books/alpha' });

    const folders = await finder().listFolder('/books');

    expect(folders.map(({ name }) => name)).toEqual(['alpha', 'Fiction', 'Poetry', 'zeta']);
  });

  test('reads every page of a big folder', async () => {
    dropbox.maxPageSize = 1;

    await expect(finder().listFolder('/books')).resolves.toHaveLength(2);
    expect(dropbox.requestsTo('files/list_folder/continue')).toHaveLength(1);
  });

  test('a library missed by search opens from the folder it was browsed to', async () => {
    dropbox.add({ path: '/New Library/metadata.db', content: 'new', unindexed: true });
    const top = await finder().listFolder(undefined);
    const picked = top.find(({ name }) => name === 'New Library')!;
    const storage = dropboxProvider.open(dropboxProvider.connectionFor(picked.id), { get: () => Promise.resolve('token') });

    await expect(storage.stat('metadata.db')).resolves.toMatchObject({ size: 3 });
  });

  test('reports a folder gone from Dropbox as NotFound', async () => {
    await expect(finder().listFolder('/gone')).rejects.toBeInstanceOf(NotFound);
  });
});
