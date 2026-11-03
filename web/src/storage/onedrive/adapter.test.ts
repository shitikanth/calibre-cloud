import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Aborted, Network, NotFound, ReconnectRequired } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { FakeGraph } from './fake-graph.ts';
import { onedriveProvider } from './provider.ts';

const library = [
  { path: '/Books/Calibre Library/metadata.db', content: 'SQLite format 3' },
  { path: '/Books/Calibre Library/Jane Austen/Emma (12)/Emma - Jane Austen.epub', content: 'an epub of emma' },
  { path: '/Books/Calibre Library/Jane Austen/Emma (12)/cover.jpg', content: 'jpeg' },
];

let graph: FakeGraph;

beforeEach(() => {
  graph = new FakeGraph(library);
  vi.stubGlobal('fetch', graph.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function tokens(get: AccessTokens['get'] = () => Promise.resolve('token')) {
  return { get: vi.fn(get) };
}

function open(accessTokens: AccessTokens = tokens(), root = '/Books/Calibre Library') {
  return onedriveProvider.open(onedriveProvider.connectionFor(root), accessTokens);
}

describe('OneDrive adapter paths', () => {
  test('stats a file at the library root, with its content tag as the version', async () => {
    await expect(open().stat('metadata.db')).resolves.toEqual({ size: 15, version: 'ctag-of-SQLite format 3' });
  });

  test('sends the access token as a bearer token', async () => {
    await open().stat('metadata.db');

    expect(graph.requests.map(({ token }) => token)).toEqual(['token']);
  });

  test('addresses a nested path by its percent-encoded path under the drive root, in one request', async () => {
    await expect(open().stat('Jane Austen/Emma (12)/Emma - Jane Austen.epub')).resolves.toMatchObject({ size: 15 });

    expect(graph.requests.map(({ path }) => path)).toEqual([
      '/v1.0/me/drive/root:/Books/Calibre%20Library/Jane%20Austen/Emma%20(12)/Emma%20-%20Jane%20Austen.epub',
    ]);
  });

  test('opens a library at the top of the OneDrive', async () => {
    graph.add({ path: '/metadata.db', content: 'top' });

    await expect(open(tokens(), '').stat('metadata.db')).resolves.toMatchObject({ size: 3 });
    expect(graph.requests.map(({ path }) => path)).toEqual(['/v1.0/me/drive/root:/metadata.db']);
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

describe('OneDrive adapter reads', () => {
  test('downloads a file from its pre-authenticated download URL, reporting progress against its size', async () => {
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

  test('sends the download host no Authorization header, so the browser needs no CORS preflight', async () => {
    await open().read('metadata.db');

    expect(graph.requests.map(({ host, token }) => [host, token])).toEqual([
      ['graph', 'token'],
      ['download', undefined],
    ]);
  });

  test('asks Graph for a fresh download URL on every read, since the URL expires within minutes', async () => {
    const storage = open();

    await storage.read('metadata.db');
    await storage.read('metadata.db');

    expect(graph.requestsTo('graph')).toHaveLength(2);
    expect(graph.requestsTo('download')).toHaveLength(2);
  });

  test('downloads from a path holding accented, non-Latin, astral, and reserved characters', async () => {
    const path = 'Émile Zola/Нана #7 (7)/Nana 📕 100% - Émile Zola.epub';
    graph.add({ path: `/Books/Calibre Library/${path}`, content: 'nana' });

    const blob = await open().read(path);

    expect(await blob.text()).toBe('nana');
    expect(graph.requestsTo('graph').map(({ path: requested }) => requested)).toEqual([
      '/v1.0/me/drive/root:/Books/Calibre%20Library/%C3%89mile%20Zola/%D0%9D%D0%B0%D0%BD%D0%B0%20%237%20(7)/Nana%20%F0%9F%93%95%20100%25%20-%20%C3%89mile%20Zola.epub',
    ]);
  });

  test('never asks Graph when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(open().read('metadata.db', { signal: controller.signal })).rejects.toBeInstanceOf(Aborted);
    expect(graph.requests).toHaveLength(0);
  });

  test('stops a download aborted midway', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn(() => controller.abort());

    await expect(open().read('metadata.db', { signal: controller.signal, onProgress })).rejects.toBeInstanceOf(Aborted);
    expect(onProgress).toHaveBeenCalledOnce();
  });

  test('replaces an expired download URL once, without the user seeing an error', async () => {
    graph.failNext({ status: 403 }, ({ host }) => host === 'download');

    const blob = await open().read('metadata.db');

    expect(await blob.text()).toBe('SQLite format 3');
    expect(graph.requests.map(({ host }) => host)).toEqual(['graph', 'download', 'graph', 'download']);
  });

  test('reports a download URL that keeps failing as Network', async () => {
    graph.failNext({ status: 403 }, ({ host }) => host === 'download');
    graph.failNext({ status: 403 }, ({ host }) => host === 'download');

    await expect(open().read('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(graph.requests).toHaveLength(4);
  });

  test('reports a file gone from OneDrive between the lookup and the download as NotFound', async () => {
    graph.failNext({ status: 404 }, ({ host }) => host === 'download');

    await expect(open().read('metadata.db')).rejects.toBeInstanceOf(NotFound);
  });

  test('reports a download cut off midway as Network', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).startsWith(graph.downloadHost)) return graph.fetch(input, init);
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

describe('OneDrive adapter errors', () => {
  test('refreshes an expired access token once and retries', async () => {
    graph.validTokens.clear();
    graph.validTokens.add('fresh');
    const accessTokens = tokens(({ refresh } = {}) => Promise.resolve(refresh ? 'fresh' : 'stale'));

    await expect(open(accessTokens).stat('metadata.db')).resolves.toMatchObject({ size: 15 });
    expect(accessTokens.get.mock.calls).toEqual([[], [{ refresh: true }]]);
    expect(graph.requests.map(({ token }) => token)).toEqual(['stale', 'fresh']);
  });

  test('asks to reconnect when Graph still refuses the refreshed token', async () => {
    graph.validTokens.clear();
    const accessTokens = tokens();

    await expect(open(accessTokens).stat('metadata.db')).rejects.toBeInstanceOf(ReconnectRequired);
    expect(accessTokens.get).toHaveBeenCalledTimes(2);
    expect(graph.requests).toHaveLength(2);
  });

  test.each([
    ['ReconnectRequired', new ReconnectRequired('grant revoked')],
    ['Network', new Network('offline')],
  ])('passes on a %s from the access tokens', async (_case, error) => {
    await expect(open(tokens(() => Promise.reject(error))).stat('metadata.db')).rejects.toBe(error);
    expect(graph.requests).toHaveLength(0);
  });

  test.each([
    ['a 429', { status: 429, code: 'activityLimitReached' }],
    ['a 503', { status: 503, code: 'serviceNotAvailable' }],
    ['a 500', { status: 500 }],
  ])('retries after %s, honouring Retry-After', async (_case, failure) => {
    graph.failNext({ ...failure, headers: { 'Retry-After': '0' } });

    await expect(open().stat('metadata.db')).resolves.toMatchObject({ size: 15 });
    expect(graph.requests).toHaveLength(2);
  });

  test.each([
    ['a 429', { status: 429 }],
    ['a 503', { status: 503 }],
  ])('reports %s that persists as Network', async (_case, failure) => {
    for (let i = 0; i < 3; i++) graph.failNext({ ...failure, headers: { 'Retry-After': '0' } });

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(graph.requests).toHaveLength(3);
  });

  test('gives up at once when Retry-After asks for too long a wait', async () => {
    graph.failNext({ status: 429, headers: { 'Retry-After': '120' } });

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(graph.requests).toHaveLength(1);
  });

  test.each([
    ['a 400', { status: 400, code: 'invalidRequest' }],
    ['a 403', { status: 403, code: 'accessDenied' }],
  ])('reports %s as Network without retrying', async (_case, failure) => {
    graph.failNext(failure);

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(graph.requests).toHaveLength(1);
  });

  test('reports a failed fetch as Network', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
  });
});
