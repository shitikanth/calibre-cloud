import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NotFound, ReconnectRequired } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { FakeGraph } from './fake-graph.ts';
import { onedriveProvider } from './provider.ts';

let graph: FakeGraph;

beforeEach(() => {
  graph = new FakeGraph([
    { path: '/Books/Fiction/metadata.db', content: 'db' },
    { path: '/Books/Poetry/metadata.db', content: 'db' },
    { path: '/Calibre Library/metadata.db', content: 'db' },
    { path: '/Calibre Library/Jane Austen/Emma (12)/metadata.opf', content: 'opf' },
    { path: '/Backups/metadata.db.bak', content: 'old' },
    { path: '/Émile/Bibliothèque #1/metadata.db', content: 'db' },
    { path: '/notes.txt', content: 'not a folder' },
    { path: '/Archive' },
  ]);
  vi.stubGlobal('fetch', graph.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function finder(get: AccessTokens['get'] = () => Promise.resolve('token')) {
  return onedriveProvider.libraryFinder({ get });
}

describe('findLibraries', () => {
  test('lists every folder holding metadata.db by its path, with the decoded path as the root', async () => {
    await expect(finder().findLibraries()).resolves.toEqual([
      { root: '/Books/Fiction', path: '/Books/Fiction' },
      { root: '/Books/Poetry', path: '/Books/Poetry' },
      { root: '/Calibre Library', path: '/Calibre Library' },
      { root: '/Émile/Bibliothèque #1', path: '/Émile/Bibliothèque #1' },
    ]);
  });

  test('searches the drive from its root, asking only for the fields it reads', async () => {
    await finder().findLibraries();

    expect(graph.requests.map(({ path }) => path)).toEqual([
      "/v1.0/me/drive/root/search(q='metadata.db')?%24select=name%2Cfile%2CparentReference&%24top=200",
    ]);
  });

  test('reads every page of search results', async () => {
    graph.maxPageSize = 2;

    await expect(finder().findLibraries()).resolves.toHaveLength(4);
    expect(graph.requests).toHaveLength(3);
  });

  test('lists a library at the top of the OneDrive', async () => {
    graph.add({ path: '/metadata.db', content: 'db' });

    await expect(finder().findLibraries()).resolves.toContainEqual({ root: '', path: '/' });
  });

  test('a library found by search opens', async () => {
    const [found] = await finder().findLibraries();
    const storage = onedriveProvider.open(onedriveProvider.connectionFor(found!.root), { get: () => Promise.resolve('token') });

    await expect(storage.stat('metadata.db')).resolves.toMatchObject({ size: 2 });
  });

  test('misses a library the search index has not caught up with', async () => {
    graph = new FakeGraph([{ path: '/New Library/metadata.db', content: 'db', unindexed: true }]);
    vi.stubGlobal('fetch', graph.fetch);

    await expect(finder().findLibraries()).resolves.toEqual([]);
  });

  test('passes on a storage error', async () => {
    const error = new ReconnectRequired('grant revoked');

    await expect(finder(() => Promise.reject(error)).findLibraries()).rejects.toBe(error);
  });
});

describe('listFolder', () => {
  test('starts at the top of the OneDrive, listing folders only, by name', async () => {
    await expect(finder().listFolder(undefined)).resolves.toEqual([
      { id: '/Archive', name: 'Archive' },
      { id: '/Backups', name: 'Backups' },
      { id: '/Books', name: 'Books' },
      { id: '/Calibre Library', name: 'Calibre Library' },
      { id: '/Émile', name: 'Émile' },
    ]);
    expect(graph.requests.map(({ path }) => path)).toEqual(['/v1.0/me/drive/root/children?%24select=name%2Cfolder&%24top=200']);
  });

  test('opens a folder by its id', async () => {
    const top = await finder().listFolder(undefined);
    const books = top.find(({ name }) => name === 'Books')!;

    await expect(finder().listFolder(books.id)).resolves.toEqual([
      { id: '/Books/Fiction', name: 'Fiction' },
      { id: '/Books/Poetry', name: 'Poetry' },
    ]);
    expect(graph.requests.at(-1)?.path).toBe('/v1.0/me/drive/root:/Books:/children?%24select=name%2Cfolder&%24top=200');
  });

  test('sorts folders by name, ignoring case', async () => {
    graph.add({ path: '/Books/zeta' });
    graph.add({ path: '/Books/alpha' });

    const folders = await finder().listFolder('/Books');

    expect(folders.map(({ name }) => name)).toEqual(['alpha', 'Fiction', 'Poetry', 'zeta']);
  });

  test('reads every page of a big folder', async () => {
    graph.maxPageSize = 1;

    await expect(finder().listFolder('/Books')).resolves.toHaveLength(2);
    expect(graph.requests).toHaveLength(2);
  });

  test('a library missed by search opens from the folder it was browsed to', async () => {
    graph.add({ path: '/New Library/metadata.db', content: 'new', unindexed: true });
    const top = await finder().listFolder(undefined);
    const picked = top.find(({ name }) => name === 'New Library')!;
    const storage = onedriveProvider.open(onedriveProvider.connectionFor(picked.id), { get: () => Promise.resolve('token') });

    await expect(storage.stat('metadata.db')).resolves.toMatchObject({ size: 3 });
  });

  test('reports a folder gone from OneDrive as NotFound', async () => {
    await expect(finder().listFolder('/gone')).rejects.toBeInstanceOf(NotFound);
  });
});
