import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Aborted, Network, NotFound, QuotaExceeded, ReconnectRequired } from '../adapter.ts';
import type { AccessTokens } from '../sign-in.ts';
import { FakeDrive, inMyDrive } from './fake-drive.ts';
import { googleProvider } from './provider.ts';

const library = [
  inMyDrive({ id: 'lib', name: 'Calibre Library', folder: true }),
  { id: 'metadata', name: 'metadata.db', parent: 'lib', content: 'SQLite format 3' },
  { id: 'author', name: 'Jane Austen', parent: 'lib', folder: true },
  { id: 'title', name: 'Emma (12)', parent: 'author', folder: true },
  { id: 'book', name: 'Emma - Jane Austen.epub', parent: 'title', content: 'an epub of emma' },
  { id: 'cover', name: 'cover.jpg', parent: 'title', content: 'jpeg' },
];

let drive: FakeDrive;

beforeEach(() => {
  drive = new FakeDrive(library);
  vi.stubGlobal('fetch', drive.fetch);
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

function open(accessTokens: AccessTokens = tokens()) {
  return googleProvider.open(googleProvider.connectionFor('lib'), accessTokens);
}

describe('Google Drive adapter paths', () => {
  test('stats a file at the library root, with its MD5 as the version', async () => {
    await expect(open().stat('metadata.db')).resolves.toEqual({ size: 15, version: 'md5-of-SQLite format 3' });
  });

  test('sends the access token as a bearer token', async () => {
    await open().stat('metadata.db');

    expect(drive.requests.map(({ token }) => token)).toEqual(['token']);
  });

  test('resolves a nested path with one request per folder level', async () => {
    await expect(open().stat('Jane Austen/Emma (12)/Emma - Jane Austen.epub')).resolves.toMatchObject({ size: 15 });

    expect(drive.requests).toHaveLength(3);
  });

  test('remembers resolved folders for the rest of the session', async () => {
    const storage = open();
    await storage.stat('Jane Austen/Emma (12)/Emma - Jane Austen.epub');
    drive.requests.length = 0;

    await storage.stat('Jane Austen/Emma (12)/cover.jpg');
    await storage.stat('Jane Austen/Emma (12)/cover.jpg');

    expect(drive.requests).toHaveLength(2);
    expect(drive.requestsMatching(/name = 'Jane Austen'/)).toHaveLength(0);
  });

  test('finds names holding quotes and backslashes', async () => {
    drive.add({ id: 'odd', name: `O'Brien \\ "Flann"`, parent: 'lib', folder: true });
    drive.add({ id: 'odd-book', name: `At Swim-Two-Birds 'n' more.pdf`, parent: 'odd', content: 'pdf' });

    await expect(open().stat(`O'Brien \\ "Flann"/At Swim-Two-Birds 'n' more.pdf`)).resolves.toMatchObject({ size: 3 });
  });

  test('takes the newest of two files with the same name', async () => {
    drive.add({ id: 'old', name: 'twin.txt', parent: 'lib', content: 'old', modifiedTime: 1 });
    drive.add({ id: 'new', name: 'twin.txt', parent: 'lib', content: 'newer', modifiedTime: 2 });

    await expect(open().stat('twin.txt')).resolves.toMatchObject({ size: 5 });
  });

  test.each([
    ['a missing file', 'nothing.db'],
    ['a file in a missing folder', 'Nobody/Nothing (1)/nothing.epub'],
    ['a folder where a file should be', 'Jane Austen'],
    ['a file where a folder should be', 'metadata.db/nothing.epub'],
  ])('reports %s as NotFound', async (_case, path) => {
    await expect(open().stat(path)).rejects.toBeInstanceOf(NotFound);
  });

  test('ignores trashed files', async () => {
    drive.add({ id: 'binned', name: 'binned.epub', parent: 'lib', content: 'x', trashed: true });

    await expect(open().stat('binned.epub')).rejects.toBeInstanceOf(NotFound);
  });
});

describe('Google Drive adapter reads', () => {
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

  test('never asks Drive when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(open().read('metadata.db', { signal: controller.signal })).rejects.toBeInstanceOf(Aborted);
    expect(drive.requests).toHaveLength(0);
  });

  test('stops a download aborted midway', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn(() => controller.abort());

    await expect(open().read('metadata.db', { signal: controller.signal, onProgress })).rejects.toBeInstanceOf(Aborted);
    expect(onProgress).toHaveBeenCalledOnce();
  });
});

describe('Google Drive adapter errors', () => {
  test('refreshes an expired access token once and retries', async () => {
    drive.validTokens.clear();
    drive.validTokens.add('fresh');
    const accessTokens = tokens(({ refresh } = {}) => Promise.resolve(refresh ? 'fresh' : 'stale'));

    await expect(open(accessTokens).stat('metadata.db')).resolves.toMatchObject({ size: 15 });
    expect(accessTokens.get.mock.calls).toEqual([[], [{ refresh: true }]]);
    expect(drive.requests.map(({ token }) => token)).toEqual(['stale', 'fresh']);
  });

  test('still retries a rate limit twice after refreshing the token', async () => {
    drive.validTokens.clear();
    drive.validTokens.add('fresh');
    const accessTokens = tokens(({ refresh } = {}) => Promise.resolve(refresh ? 'fresh' : 'stale'));
    for (let i = 0; i < 2; i++) drive.failNext({ status: 429, reason: 'rateLimitExceeded', headers: { 'Retry-After': '0' } });

    await expect(open(accessTokens).stat('metadata.db')).resolves.toMatchObject({ size: 15 });
    expect(drive.requests.map(({ token }) => token)).toEqual(['stale', 'fresh', 'fresh', 'fresh']);
  });

  test('asks to reconnect when Drive still refuses the refreshed token', async () => {
    drive.validTokens.clear();
    const accessTokens = tokens();

    await expect(open(accessTokens).stat('metadata.db')).rejects.toBeInstanceOf(ReconnectRequired);
    expect(accessTokens.get).toHaveBeenCalledTimes(2);
    expect(drive.requests).toHaveLength(2);
  });

  test.each([
    ['ReconnectRequired', new ReconnectRequired('grant revoked')],
    ['Network', new Network('offline')],
  ])('passes on a %s from the access tokens', async (_case, error) => {
    await expect(open(tokens(() => Promise.reject(error))).stat('metadata.db')).rejects.toBe(error);
    expect(drive.requests).toHaveLength(0);
  });

  test('reports a file gone from Drive as NotFound', async () => {
    drive.failNext({ status: 404, reason: 'notFound' }, (url) => url.searchParams.get('alt') === 'media');

    await expect(open().read('metadata.db')).rejects.toBeInstanceOf(NotFound);
  });

  test('reports an exhausted download quota as QuotaExceeded, with its Retry-After', async () => {
    drive.failNext({ status: 403, reason: 'downloadQuotaExceeded', headers: { 'Retry-After': '3600' } });

    const error = await open().read('metadata.db').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(QuotaExceeded);
    expect((error as QuotaExceeded).retryAfter).toBe(3600);
  });

  test('reports an exhausted download quota without Retry-After as QuotaExceeded', async () => {
    drive.failNext({ status: 403, reason: 'downloadQuotaExceeded' });

    const error = await open().read('metadata.db').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(QuotaExceeded);
    expect((error as QuotaExceeded).retryAfter).toBeUndefined();
  });

  test.each([
    ['a 403 userRateLimitExceeded', { status: 403, reason: 'userRateLimitExceeded' }],
    ['a 403 rateLimitExceeded', { status: 403, reason: 'rateLimitExceeded' }],
    ['a 429', { status: 429, reason: 'rateLimitExceeded' }],
    ['a 503', { status: 503, reason: 'backendError' }],
  ])('retries after %s', async (_case, failure) => {
    drive.failNext({ ...failure, headers: { 'Retry-After': '0' } });

    await expect(open().stat('metadata.db')).resolves.toMatchObject({ size: 15 });
    expect(drive.requests).toHaveLength(2);
  });

  test.each([
    ['a 403 userRateLimitExceeded', { status: 403, reason: 'userRateLimitExceeded' }],
    ['a 429', { status: 429, reason: 'rateLimitExceeded' }],
    ['a 500', { status: 500 }],
  ])('reports %s that persists as Network', async (_case, failure) => {
    for (let i = 0; i < 3; i++) drive.failNext({ ...failure, headers: { 'Retry-After': '0' } });

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(drive.requests).toHaveLength(3);
  });

  test('waits as long as Retry-After asks before retrying', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    drive.failNext({ status: 429, reason: 'rateLimitExceeded', headers: { 'Retry-After': '5' } });

    const stat = open().stat('metadata.db');
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(drive.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(stat).resolves.toMatchObject({ size: 15 });
    expect(drive.requests).toHaveLength(2);
  });

  test('backs off before retrying when Drive gives no Retry-After', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    drive.failNext({ status: 429, reason: 'rateLimitExceeded' });

    const stat = open().stat('metadata.db');
    await retryScheduled();
    await vi.advanceTimersByTimeAsync(999);
    expect(drive.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(stat).resolves.toMatchObject({ size: 15 });
  });

  test('gives up at once when Retry-After asks for too long a wait', async () => {
    drive.failNext({ status: 429, reason: 'rateLimitExceeded', headers: { 'Retry-After': '120' } });

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(drive.requests).toHaveLength(1);
  });

  test('stops waiting to retry when the read is aborted', async () => {
    drive.failNext({ status: 429, reason: 'rateLimitExceeded', headers: { 'Retry-After': '5' } });
    const controller = new AbortController();

    const read = open().read('metadata.db', { signal: controller.signal });
    await vi.waitFor(() => expect(drive.requests).toHaveLength(1));
    controller.abort();

    await expect(read).rejects.toBeInstanceOf(Aborted);
    expect(drive.requests).toHaveLength(1);
  });

  test.each([
    ['a 400', { status: 400, reason: 'invalid' }],
    ['another 403', { status: 403, reason: 'cannotDownloadFile' }],
  ])('reports %s as Network without retrying', async (_case, failure) => {
    drive.failNext(failure);

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
    expect(drive.requests).toHaveLength(1);
  });

  test('reports a failed fetch as Network', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));

    await expect(open().stat('metadata.db')).rejects.toBeInstanceOf(Network);
  });

  test('reports a download cut off midway as Network', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('alt=media')) return drive.fetch(input, init);
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
