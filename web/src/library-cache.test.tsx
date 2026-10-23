import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Network, QuotaExceeded } from './storage/adapter.ts';
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

function metadataStats(storage: FakeStorage) {
  return metadataCalls(storage).filter(({ op }) => op === 'stat');
}

test('loading a book page directly checks the library for changes once', async () => {
  const storage = await libraryOf(brontës);
  const app = await renderApp({ storage, connected: true, path: '/books/2' });
  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Wuthering Heights' })).toBeVisible();
  storage.calls.length = 0;

  const reloaded = await app.reload();

  await expect.element(reloaded.getByRole('heading', { level: 1, name: 'Wuthering Heights' })).toBeVisible();
  await expect.poll(() => metadataStats(storage)).toHaveLength(1);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(metadataStats(storage)).toHaveLength(1);
});

test('going from the grid to a book and back does not check the library again', async () => {
  const storage = await libraryOf(brontës);
  const app = await renderApp({ storage, connected: true });
  await expect.element(app.screen.getByText('3 books')).toBeVisible();
  storage.calls.length = 0;
  const reloaded = await app.reload();
  await expect.element(reloaded.getByText('3 books')).toBeVisible();
  await expect.poll(() => metadataStats(storage)).toHaveLength(1);

  await userEvent.click(reloaded.getByRole('link', { name: /Jane Eyre/ }));
  await expect.element(reloaded.getByRole('heading', { level: 1, name: 'Jane Eyre' })).toBeVisible();
  await userEvent.click(reloaded.getByRole('link', { name: '← Library' }));
  await expect.element(reloaded.getByText('3 books')).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 300));

  expect(metadataStats(storage)).toHaveLength(1);
});

async function withNewBook(storage: FakeStorage, version: string) {
  const { 'metadata.db': updated } = await buildCalibreLibrary([
    ...brontës,
    { title: 'Shirley', authors: ['Charlotte Brontë'] },
  ]);
  storage.put('metadata.db', updated!, version);
}

test('a second tab says the library is open in another tab', async () => {
  const storage = await libraryOf(brontës);
  const first = await renderApp({ storage, connected: true });
  await expect.element(first.screen.getByText('3 books')).toBeVisible();

  const second = await renderApp({ storage, connected: true });

  await expect
    .element(second.screen.getByRole('heading', { name: 'Library is open in another tab' }))
    .toBeVisible();
  await expect.element(second.screen.getByText(/Close the other tab/)).toBeVisible();
  expect(second.screen.getByRole('alert').getByRole('button').elements().map((button) => button.textContent)).toEqual(['Try again']);
  await expect.element(first.screen.getByText('3 books')).toBeVisible();

  await first.screen.unmount();
  await userEvent.click(second.screen.getByRole('button', { name: 'Try again' }));

  await expect.element(second.screen.getByText('3 books')).toBeVisible();
});

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

test('Refresh library picks up a change made after the page loaded', async () => {
  const storage = await libraryOf(brontës);
  const app = await renderApp({ storage, connected: true });
  await expect.element(app.screen.getByText('3 books')).toBeVisible();
  await withNewBook(storage, '2');
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(metadataCalls(storage).filter(({ op }) => op === 'stat')).toHaveLength(1);

  await userEvent.click(app.screen.getByRole('button', { name: 'Refresh library' }));

  await expect.element(app.screen.getByText('4 books')).toBeVisible();
  await expect.element(app.screen.getByRole('status')).toHaveTextContent('Library updated');
  expect(metadataCalls(storage).filter(({ op }) => op === 'stat')).toHaveLength(2);
});

test('a failed download of a changed library keeps the cached one browsable with a banner', async () => {
  const storage = await libraryOf(brontës);
  const app = await renderApp({ storage, connected: true });
  await expect.element(app.screen.getByText('3 books')).toBeVisible();
  await withNewBook(storage, '2');
  storage.failWith('metadata.db', new Network(), 'read');

  const reloaded = await app.reload();

  await expect.element(reloaded.getByRole('alert')).toMatchTextContent(/Couldn’t reach your library/);
  await expect.element(reloaded.getByText('3 books')).toBeVisible();
  await expect.element(reloaded.getByRole('heading', { level: 2, name: 'Agnes Grey' })).toBeVisible();

  const again = await app.reload();
  await expect.element(again.getByRole('alert')).toMatchTextContent(/Couldn’t reach your library/);
  await expect.element(again.getByText('3 books')).toBeVisible();
});

test('an unreachable library keeps the cached one browsable with a banner saying why', async () => {
  const storage = await libraryOf(brontës);
  const app = await renderApp({ storage, connected: true });
  await expect.element(app.screen.getByText('3 books')).toBeVisible();
  storage.failWith('metadata.db', new Network(), 'stat');

  const reloaded = await app.reload();

  await expect.element(reloaded.getByRole('alert')).toMatchTextContent(/Couldn’t reach your library/);
  await expect.element(reloaded.getByText('3 books')).toBeVisible();
  await userEvent.click(reloaded.getByRole('link', { name: /Wuthering Heights/ }));
  await expect.element(reloaded.getByRole('heading', { level: 1, name: 'Wuthering Heights' })).toBeVisible();
});

test('MEGA over quota keeps the cached library browsable with a banner saying why', async () => {
  const storage = await libraryOf(brontës);
  const app = await renderApp({ storage, connected: true });
  await expect.element(app.screen.getByText('3 books')).toBeVisible();
  storage.failWith('metadata.db', new QuotaExceeded());

  const reloaded = await app.reload();

  await expect.element(reloaded.getByRole('alert')).toMatchTextContent(/Download quota exceeded/);
  await expect.element(reloaded.getByText('3 books')).toBeVisible();
  await expect.element(reloaded.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
});
