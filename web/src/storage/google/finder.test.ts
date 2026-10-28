import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ReconnectRequired } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { FakeDrive, inMyDrive } from './fake-drive.ts';
import { googleProvider } from './provider.ts';

let drive: FakeDrive;

beforeEach(() => {
  drive = new FakeDrive([
    inMyDrive({ id: 'books', name: 'Books', folder: true }),
    { id: 'fiction', name: 'Fiction', parent: 'books', folder: true },
    { id: 'fiction-db', name: 'metadata.db', parent: 'fiction', content: 'db' },
    { id: 'poetry', name: 'Poetry', parent: 'books', folder: true },
    { id: 'poetry-db', name: 'metadata.db', parent: 'poetry', content: 'db' },
    inMyDrive({ id: 'calibre', name: 'Calibre Library', folder: true }),
    { id: 'calibre-db', name: 'metadata.db', parent: 'calibre', content: 'db' },
    inMyDrive({ id: 'old', name: 'Old Library', folder: true }),
    { id: 'old-db', name: 'metadata.db', parent: 'old', content: 'db', trashed: true },
    inMyDrive({ id: 'notes', name: 'notes.txt', content: 'not a folder' }),
    { id: 'dad', name: 'Dad’s Library', folder: true, sharedWithMe: true },
    { id: 'dad-db', name: 'metadata.db', parent: 'dad', content: 'db' },
    { id: 'club', name: 'Book Club', folder: true, sharedWithMe: true },
    { id: 'club-library', name: 'Library', parent: 'club', folder: true },
    { id: 'club-db', name: 'metadata.db', parent: 'club-library', content: 'db' },
    { id: 'loose-db', name: 'metadata.db', content: 'shared on its own', sharedWithMe: true },
    { id: 'shared-file', name: 'shared.pdf', content: 'pdf', sharedWithMe: true },
  ]);
  vi.stubGlobal('fetch', drive.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function finder(get: AccessTokens['get'] = () => Promise.resolve('token')) {
  return googleProvider.libraryFinder({ get });
}

describe('findLibraries', () => {
  test('lists every folder holding metadata.db in My Drive and Shared with me, with its path', async () => {
    await expect(finder().findLibraries()).resolves.toEqual([
      { root: 'fiction', path: 'My Drive/Books/Fiction' },
      { root: 'poetry', path: 'My Drive/Books/Poetry' },
      { root: 'calibre', path: 'My Drive/Calibre Library' },
      { root: 'club-library', path: 'Shared with me/Book Club/Library' },
      { root: 'dad', path: 'Shared with me/Dad’s Library' },
    ]);
  });

  test('reads every page of search results', async () => {
    drive.maxPageSize = 2;

    await expect(finder().findLibraries()).resolves.toHaveLength(5);
  });

  test('looks up each folder on the way to My Drive once', async () => {
    await finder().findLibraries();

    expect(drive.requestsMatching(/files\/books\?/)).toHaveLength(1);
  });

  test('starts the path at Shared with me when a parent folder is out of sight', async () => {
    drive.add({ id: 'hidden-child', name: 'Visible Library', parent: 'hidden-parent', folder: true });
    drive.add({ id: 'hidden-child-db', name: 'metadata.db', parent: 'hidden-child', content: 'db' });

    await expect(finder().findLibraries()).resolves.toContainEqual({ root: 'hidden-child', path: 'Shared with me/Visible Library' });
  });

  test('finds nothing in an empty Drive', async () => {
    drive = new FakeDrive();
    vi.stubGlobal('fetch', drive.fetch);

    await expect(finder().findLibraries()).resolves.toEqual([]);
  });

  test('passes on a storage error', async () => {
    const error = new ReconnectRequired('grant revoked');

    await expect(finder(() => Promise.reject(error)).findLibraries()).rejects.toBe(error);
  });
});

describe('listFolder', () => {
  test('starts at My Drive and Shared with me', async () => {
    const top = await finder().listFolder(undefined);

    expect(top.map(({ name }) => name)).toEqual(['My Drive', 'Shared with me']);
    expect(drive.requests).toHaveLength(0);
  });

  test('lists the folders in My Drive by name, leaving out files and the trash', async () => {
    const [myDrive] = await finder().listFolder(undefined);

    await expect(finder().listFolder(myDrive!.id)).resolves.toEqual([
      { id: 'books', name: 'Books' },
      { id: 'calibre', name: 'Calibre Library' },
      { id: 'old', name: 'Old Library' },
    ]);
  });

  test('lists the folders shared with me', async () => {
    const [, sharedWithMe] = await finder().listFolder(undefined);

    await expect(finder().listFolder(sharedWithMe!.id)).resolves.toEqual([
      { id: 'club', name: 'Book Club' },
      { id: 'dad', name: 'Dad’s Library' },
    ]);
  });

  test('sorts folders by name, ignoring case', async () => {
    drive.add({ id: 'zeta', name: 'zeta', parent: 'books', folder: true });
    drive.add({ id: 'alpha', name: 'alpha', parent: 'books', folder: true });

    const folders = await finder().listFolder('books');

    expect(folders.map(({ name }) => name)).toEqual(['alpha', 'Fiction', 'Poetry', 'zeta']);
  });

  test('reads every page of a big folder', async () => {
    drive.maxPageSize = 1;

    await expect(finder().listFolder('books')).resolves.toHaveLength(2);
  });

  test('My Drive itself opens as a library root', async () => {
    drive.add(inMyDrive({ id: 'top-db', name: 'metadata.db', content: 'top' }));
    const [myDrive] = await finder().listFolder(undefined);
    const storage = googleProvider.open(googleProvider.connectionFor(myDrive!.id), { get: () => Promise.resolve('token') });

    await expect(storage.stat('metadata.db')).resolves.toMatchObject({ size: 3 });
  });
});
