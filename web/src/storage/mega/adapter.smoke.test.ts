import { describe, expect, inject, test } from 'vitest';
import { LibraryIndex } from '../../library/library-index.ts';
import { Aborted, NotFound } from '../adapter.ts';
import { createMegaAdapter } from './adapter.ts';

const link = inject('megaSmokeLink');

describe.skipIf(!link)('MEGA adapter against the owner’s test library (local only)', { timeout: 120_000 }, () => {
  const mega = createMegaAdapter(link);

  test('stats and downloads metadata.db with progress, and SQLite opens it', async () => {
    const { size, version } = await mega.stat('metadata.db');
    expect(size).toBeGreaterThan(0);
    expect(version).toMatch(/^\d+$/);

    const progress: number[] = [];
    const blob = await mega.read('metadata.db', { onProgress: (loaded) => progress.push(loaded) });
    expect(blob.size).toBe(size);
    expect(progress.at(-1)).toBe(size);
    expect(await blob.slice(0, 15).text()).toBe('SQLite format 3');

    const index = new LibraryIndex();
    try {
      await index.open(await blob.arrayBuffer());
      expect(await index.countBooks()).toBeGreaterThan(0);
    } finally {
      index.dispose();
    }
  });

  test('a path that is not in the library is NotFound', async () => {
    await expect(mega.stat('no such file.db')).rejects.toBeInstanceOf(NotFound);
  });

  test('aborting a download rejects with Aborted', async () => {
    const controller = new AbortController();
    const read = mega.read('metadata.db', { signal: controller.signal, onProgress: () => controller.abort() });
    await expect(read).rejects.toBeInstanceOf(Aborted);
  });
});
