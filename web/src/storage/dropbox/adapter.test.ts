import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Aborted, Network, NotFound, ReconnectRequired } from '../adapter.ts';
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

const realSetTimeout = globalThis.setTimeout;

async function retryScheduled() {
  while (vi.getTimerCount() === 0) await new Promise((resolve) => realSetTimeout(resolve, 5));
}

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

describe('Dropbox adapter errors', () => {
  test('refreshes an expired access token once and retries', async () => {
    dropbox.validTokens.clear();
    dropbox.validTokens.add('fresh');
    const accessTokens = tokens(({ refresh } = {}) => Promise.resolve(refresh ? 'fresh' : 'stale'));

    await expect(open(accessTokens).stat('metadata.db')).resolves.toMatchObject({ size: 15 });
    expect(accessTokens.get.mock.calls).toEqual([[], [{ refresh: true }]]);
    expect(dropbox.requests.map(({ token }) => token)).toEqual(['stale', 'fresh']);
  });

  test('still retries a rate limit twice after refreshing the token', async () => {
    dropbox.validTokens.clear();
    dropbox.validTokens.add('fresh');
    const accessTokens = tokens(({ refresh } = {}) => Promise.resolve(refresh ? 'fresh' : 'stale'));
    for (let i = 0; i < 2; i++) dropbox.failNext({ status: 429, headers: { 'Retry-After': '0' } });

    await expect(open(accessTokens).stat('metadata.db')).resolves.toMatchObject({ size: 15 });
    expect(dropbox.requests.map(({ token }) => token)).toEqual(['stale', 'fresh', 'fresh', 'fresh']);
  });

  test('asks to reconnect when Dropbox still refuses the refreshed token', async () => {
    dropbox.validTokens.clear();
    const accessTokens = tokens();

    await expect(open(accessTokens).stat('metadata.db')).rejects.toBeInstanceOf(ReconnectRequired);
    expect(accessTokens.get).toHaveBeenCalledTimes(2);
    expect(dropbox.requests).toHaveLength(2);
  });

  test('asks to reconnect when a download is refused after refreshing the token', async () => {
    dropbox.failNext({ status: 401, summary: 'expired_access_token/' }, (endpoint) => endpoint === 'files/download');
    dropbox.failNext({ status: 401, summary: 'invalid_access_token/' }, (endpoint) => endpoint === 'files/download');

    await expect(open().read('metadata.db')).rejects.toBeInstanceOf(ReconnectRequired);
  });

  test.each([
    ['ReconnectRequired', new ReconnectRequired('grant revoked')],
    ['Network', new Network('offline')],
  ])('passes on a %s from the access tokens', async (_case, error) => {
    await expect(open(tokens(() => Promise.reject(error))).stat('metadata.db')).rejects.toBe(error);
    expect(dropbox.requests).toHaveLength(0);
  });

  test('reports a file gone from Dropbox between stat and download as NotFound', async () => {
    dropbox.failNext({ status: 409, summary: 'path/not_found/..' }, (endpoint) => endpoint === 'files/download');

    await expect(open().read('metadata.db')).rejects.toBeInstanceOf(NotFound);
  });

  test.each([
    ['a 429', { status: 429 }],
    ['a 503', { status: 503 }],
    ['a 500', { status: 500 }],
  ])('retries after %s', async (_case, failure) => {
    dropbox.failNext({ ...failure, headers: { 'Retry-After': '0' } });

    await expect(open().stat('metadata.db')).resolves.toMatchObject({ size: 15 });
    expect(dropbox.requests).toHaveLength(2);
  });

  test('retries a rate-limited download', async () => {
    dropbox.failNext({ status: 429, headers: { 'Retry-After': '0' } }, (endpoint) => endpoint === 'files/download');

    const blob = await open().read('metadata.db');

    expect(await blob.text()).toBe('SQLite format 3');
    expect(dropbox.requestsTo('files/download')).toHaveLength(2);
  });

  test.each([
    ['a 429', { status: 429 }],
    ['a 503', { status: 503 }],
  ])('reports %s that persists as Network', async (_case, failure) => {
    for (let i = 0; i < 3; i++) dropbox.failNext({ ...failure, headers: { 'Retry-After': '0' } });

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(dropbox.requests).toHaveLength(3);
  });

  test('waits as long as Retry-After asks before retrying', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    dropbox.failNext({ status: 429, headers: { 'Retry-After': '5' } });

    const stat = open().stat('metadata.db');
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(dropbox.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(stat).resolves.toMatchObject({ size: 15 });
    expect(dropbox.requests).toHaveLength(2);
  });

  test('backs off before retrying when Dropbox gives no Retry-After', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    dropbox.failNext({ status: 503 });

    const stat = open().stat('metadata.db');
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(999);
    expect(dropbox.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(stat).resolves.toMatchObject({ size: 15 });
  });

  test('gives up at once when Retry-After asks for too long a wait', async () => {
    dropbox.failNext({ status: 429, headers: { 'Retry-After': '120' } });

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(dropbox.requests).toHaveLength(1);
  });

  test('stops waiting to retry when the read is aborted', async () => {
    dropbox.failNext({ status: 429, headers: { 'Retry-After': '5' } });
    const controller = new AbortController();

    const read = open().read('metadata.db', { signal: controller.signal });
    await vi.waitFor(() => expect(dropbox.requests).toHaveLength(1));
    controller.abort();

    await expect(read).rejects.toBeInstanceOf(Aborted);
    expect(dropbox.requests).toHaveLength(1);
  });

  test.each([
    ['a 400', { status: 400, summary: 'Error in call to API function' }],
    ['a 403', { status: 403 }],
    ['another 409', { status: 409, summary: 'unsupported_file/' }],
  ])('reports %s as Network without retrying', async (_case, failure) => {
    dropbox.failNext(failure);

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(dropbox.requests).toHaveLength(1);
  });

  test('reports a failed fetch as Network', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
  });

  test('reports a download cut off midway as Network', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).endsWith('/files/download')) return dropbox.fetch(input, init);
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.error(new TypeError('network error'));
        },
      });
      return new Response(body);
    });

    await expect(open().read('metadata.db')).rejects.toBeInstanceOf(Network);
  });
});
