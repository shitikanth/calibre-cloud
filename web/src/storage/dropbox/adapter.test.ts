import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Aborted, NotFound } from '../adapter.ts';
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

  test('opens a library at the top of the Dropbox', async () => {
    dropbox.add({ path: '/metadata.db', content: 'top' });

    await expect(open(tokens(), '').stat('metadata.db')).resolves.toMatchObject({ size: 3 });
  });

  test.each([
    ['a missing file', 'nothing.db'],
    ['a file in a missing folder', 'Nobody/Nothing (1)/nothing.epub'],
    ['a folder where a file should be', 'Jane Austen'],
    ['a file where a folder should be', 'metadata.db/nothing.epub'],
    ['an empty path', ''],
  ])('reports %s as NotFound', async (_case, path) => {
    await expect(open().stat(path)).rejects.toBeInstanceOf(NotFound);
  });
});

describe('Dropbox adapter reads', () => {
  test('downloads a file, reporting progress against its size', async () => {
    const progress: [number, number][] = [];

    const blob = await open().read('Jane Austen/Emma (12)/Emma - Jane Austen.epub', {
      onProgress: (loaded, total) => progress.push([loaded, total]),
    });

    expect(await blob.text()).toBe('an epub of emma');
    expect(progress).toEqual([
      [4, 15],
      [8, 15],
      [12, 15],
      [15, 15],
    ]);
  });

  test('downloads from a path holding accented, non-Latin, and astral characters', async () => {
    const path = 'Émile Zola/Нана (7)/Nana 📕 - Émile Zola.epub';
    dropbox.add({ path: `/Books/Calibre Library/${path}`, content: 'nana' });

    const blob = await open().read(path);

    expect(await blob.text()).toBe('nana');
    expect(dropbox.requestsTo('files/download').map(({ header }) => header)).toEqual([
      '{"path":"/books/calibre library/\\u00c9mile Zola/\\u041d\\u0430\\u043d\\u0430 (7)/Nana \\ud83d\\udcd5 - \\u00c9mile Zola.epub"}',
    ]);
  });

  test('never asks Dropbox when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(open().read('metadata.db', { signal: controller.signal })).rejects.toBeInstanceOf(Aborted);
    expect(dropbox.requests).toHaveLength(0);
  });

  test('stops a download aborted midway', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn(() => controller.abort());

    await expect(open().read('metadata.db', { signal: controller.signal, onProgress })).rejects.toBeInstanceOf(Aborted);
    expect(onProgress).toHaveBeenCalledOnce();
  });
});
