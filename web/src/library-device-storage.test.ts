import { expect, onTestFinished, test } from 'vitest';
import { LibraryIndex } from './library/library-index.ts';
import { openLibrary } from './library/sync.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';

function visit(options: { onDevice: boolean }) {
  const index = new LibraryIndex(options);
  onTestFinished(() => index.dispose());
  return index;
}

test('a browser without OPFS opens the library in memory and downloads it on every visit', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'] }]));

  const first = visit({ onDevice: false });
  expect(await openLibrary(first, storage, undefined)).toEqual({ fromCache: false });
  expect(await first.countBooks()).toBe(1);
  first.dispose();

  const second = visit({ onDevice: false });
  expect(await openLibrary(second, storage, undefined)).toEqual({ fromCache: false });
  expect(await second.countBooks()).toBe(1);
  expect(storage.calls.filter(({ op }) => op === 'read')).toHaveLength(2);
});

test('a browser with OPFS reads the library from the device on the next visit', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'] }]));
  const first = visit({ onDevice: true });
  expect(await openLibrary(first, storage, undefined)).toEqual({ fromCache: false });
  first.dispose();

  const second = visit({ onDevice: true });

  expect(await openLibrary(second, storage, undefined)).toEqual({ fromCache: true });
  expect(await second.countBooks()).toBe(1);
  expect(storage.calls.filter(({ op }) => op === 'read')).toHaveLength(1);
});
