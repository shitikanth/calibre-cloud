import { expect, test } from 'vitest';
import { buildCalibreLibrary, type BookSpec } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const brontës: BookSpec[] = [
  { title: 'Jane Eyre', authors: ['Charlotte Brontë'] },
  { title: 'Wuthering Heights', authors: ['Emily Brontë'] },
  { title: 'Agnes Grey', authors: ['Anne Brontë'] },
];

async function libraryOf(books: BookSpec[]) {
  return new FakeStorage(await buildCalibreLibrary(books));
}

function metadataCalls(storage: FakeStorage) {
  return storage.calls.filter(({ path }) => path === 'metadata.db');
}

test('a returning owner sees the cached library without waiting on the network', async () => {
  const storage = await libraryOf(brontës);
  const app = await renderApp({ storage, connected: true });
  await expect.element(app.screen.getByText('3 books')).toBeVisible();
  storage.calls.length = 0;
  const check = storage.holdNextStat('metadata.db');

  const reloaded = await app.reload();

  await expect.element(reloaded.getByText('3 books')).toBeVisible();
  await expect.element(reloaded.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  await check.started;
  check.release();
  expect(metadataCalls(storage)).toEqual([{ op: 'stat', path: 'metadata.db' }]);
});

async function withNewBook(storage: FakeStorage, version: string) {
  const { 'metadata.db': updated } = await buildCalibreLibrary([
    ...brontës,
    { title: 'Shirley', authors: ['Charlotte Brontë'] },
  ]);
  storage.put('metadata.db', updated!, version);
}

test('a changed library downloads in the background, swaps in, and says so', async () => {
  const storage = await libraryOf(brontës);
  const app = await renderApp({ storage, connected: true });
  await expect.element(app.screen.getByText('3 books')).toBeVisible();
  await withNewBook(storage, '2');
  const download = storage.holdNextRead('metadata.db');

  const reloaded = await app.reload();

  await download.started;
  await expect.element(reloaded.getByText('3 books')).toBeVisible();
  download.release();
  await expect.element(reloaded.getByRole('status')).toHaveTextContent('Library updated');
  await expect.element(reloaded.getByText('4 books')).toBeVisible();
  await expect.element(reloaded.getByRole('heading', { level: 2, name: 'Shirley' })).toBeVisible();

  storage.calls.length = 0;
  const again = await app.reload();
  await expect.element(again.getByText('4 books')).toBeVisible();
  await expect.poll(() => metadataCalls(storage)).toEqual([{ op: 'stat', path: 'metadata.db' }]);
  expect(again.getByRole('status').query()).toBeNull();
});
