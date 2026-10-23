import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { Network, QuotaExceeded } from './storage/adapter.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

async function oneBookLibrary() {
  return new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'] }]));
}

test('the first download of the library shows its progress', async () => {
  const storage = await oneBookLibrary();
  const download = storage.holdNextRead('metadata.db');
  const app = await renderApp({ storage, connected: true });

  await download.started;
  await expect.element(app.screen.getByRole('progressbar', { name: 'Downloading library' })).toBeVisible();
  await expect.element(app.screen.getByText('50%')).toBeVisible();

  download.release();
  await expect.element(app.screen.getByText('1 book')).toBeVisible();
  expect(app.screen.getByRole('progressbar').query()).toBeNull();
});

test('an exceeded download quota asks the owner to try later', async () => {
  const storage = await oneBookLibrary();
  storage.failWith('metadata.db', new QuotaExceeded());
  const app = await renderApp({ storage, connected: true });

  await expect.element(app.screen.getByRole('heading', { name: 'Download quota exceeded' })).toBeVisible();
  await expect.element(app.screen.getByText(/Try later/)).toBeVisible();
});

test('a network failure explains itself and the library loads on retry', async () => {
  const storage = await oneBookLibrary();
  storage.failWith('metadata.db', new Network());
  const app = await renderApp({ storage, connected: true });

  await expect.element(app.screen.getByRole('heading', { name: 'Couldn’t reach your library' })).toBeVisible();
  await expect.element(app.screen.getByText(/Check your internet connection/)).toBeVisible();

  storage.heal('metadata.db');
  await userEvent.click(app.screen.getByRole('button', { name: 'Try again' }));

  await expect.element(app.screen.getByText('1 book')).toBeVisible();
});

test('a file that is not a SQLite database shows that the library could not be opened', async () => {
  const app = await renderApp({ storage: new FakeStorage({ 'metadata.db': 'not a database' }), connected: true });

  await expect.element(app.screen.getByRole('heading', { name: 'Couldn’t open this library' })).toBeVisible();
});
