import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Network, NotFound } from '../adapter.ts';
import { createMegaAdapter } from './adapter.ts';

type RemoteFile = { name: string; timestamp: number; content?: string };

const remote = vi.hoisted(() => ({
  files: [] as RemoteFile[],
  loads: 0,
  failure: undefined as Error | undefined,
}));

const streamOf = vi.hoisted(() => (content: string) => {
  const listeners = new Map<string, (chunk?: Uint8Array) => void>();
  queueMicrotask(() => {
    listeners.get('data')?.(new TextEncoder().encode(content));
    listeners.get('end')?.();
  });
  return {
    on(event: string, listener: (chunk?: Uint8Array) => void) {
      listeners.set(event, listener);
      return this;
    },
    destroy() {},
  };
});

vi.mock('megajs', () => ({
  File: {
    fromURL: () => ({
      name: 'Calibre Library',
      directory: true,
      timestamp: 0,
      children: undefined as unknown[] | undefined,
      loadAttributes() {
        remote.loads += 1;
        if (remote.failure) return Promise.reject(remote.failure);
        this.children = remote.files.map((file) => ({ ...file, directory: false, size: file.content?.length ?? 0, download: () => streamOf(file.content ?? '') }));
        return Promise.resolve(this);
      },
    }),
  },
}));

beforeEach(() => {
  remote.files = [{ name: 'metadata.db', timestamp: 100 }];
  remote.loads = 0;
  remote.failure = undefined;
});

const connect = () => createMegaAdapter('https://mega.nz/folder/abc#key');

describe('MEGA adapter listing', () => {
  test('stat sees a metadata.db that changed since the last call', async () => {
    const mega = connect();
    await expect(mega.stat('metadata.db')).resolves.toMatchObject({ version: '100' });

    remote.files = [{ name: 'metadata.db', timestamp: 200 }];

    await expect(mega.stat('metadata.db')).resolves.toMatchObject({ version: '200' });
  });

  test('read finds a book added after the listing was fetched', async () => {
    const mega = connect();
    await mega.stat('metadata.db');

    remote.files = [...remote.files, { name: 'Emma.epub', timestamp: 300, content: 'an epub of emma' }];

    await expect(mega.read('Emma.epub').then((blob) => blob.text())).resolves.toBe('an epub of emma');
  });

  test('read of a listed path reuses the last listing', async () => {
    const mega = connect();
    await mega.stat('metadata.db');

    await mega.read('metadata.db');

    expect(remote.loads).toBe(1);
  });

  test('read of a path in neither listing is NotFound after one refetch', async () => {
    const mega = connect();
    await mega.stat('metadata.db');

    await expect(mega.read('Emma.epub')).rejects.toBeInstanceOf(NotFound);
    expect(remote.loads).toBe(2);
  });

  test('a failed fetch is a storage error and the next call fetches again', async () => {
    const mega = connect();
    remote.failure = new Error('MEGA returned a 503 status code');

    await expect(mega.read('metadata.db')).rejects.toBeInstanceOf(Network);

    remote.failure = undefined;
    await expect(mega.read('metadata.db')).resolves.toBeInstanceOf(Blob);
    expect(remote.loads).toBe(2);
  });
});
