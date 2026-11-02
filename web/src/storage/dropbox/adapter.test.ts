import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AccessTokens } from '../sign-in.ts';
import { FakeDropbox } from './fake-dropbox.ts';
import { dropboxProvider } from './provider.ts';

const library = [
  { path: '/Books/Calibre Library/metadata.db', content: 'SQLite format 3' },
  { path: '/Books/Calibre Library/Jane Austen/Emma (12)/Emma - Jane Austen.epub', content: 'an epub of emma' },
  { path: '/Books/Calibre Library/Jane Austen/Emma (12)/cover.jpg', content: 'jpeg' },
];

let dropbox: FakeDropbox;

beforeEach(() => {
  dropbox = new FakeDropbox(library);
  vi.stubGlobal('fetch', dropbox.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function tokens(get: AccessTokens['get'] = () => Promise.resolve('token')) {
  return { get: vi.fn(get) };
}

function open(accessTokens: AccessTokens = tokens(), root = '/books/calibre library') {
  return dropboxProvider.open(dropboxProvider.connectionFor(root), accessTokens);
}

describe('Dropbox adapter paths', () => {
  test('stats a file at the library root, with its content hash as the version', async () => {
    await expect(open().stat('metadata.db')).resolves.toEqual({ size: 15, version: 'hash-of-SQLite format 3' });
  });

  test('sends the access token as a bearer token', async () => {
    await open().stat('metadata.db');

    expect(dropbox.requests.map(({ token }) => token)).toEqual(['token']);
  });

  test('stats a nested path in one request', async () => {
    await expect(open().stat('Jane Austen/Emma (12)/Emma - Jane Austen.epub')).resolves.toMatchObject({ size: 15 });

    expect(dropbox.requests.map(({ endpoint, arg }) => [endpoint, arg])).toEqual([
      ['files/get_metadata', { path: '/books/calibre library/Jane Austen/Emma (12)/Emma - Jane Austen.epub' }],
    ]);
  });
});
