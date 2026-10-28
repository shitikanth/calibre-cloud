import { expect, onTestFinished, test, vi } from 'vitest';
import { chooseFromMenu } from './test/app-bar.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { chooseScreen, connectMega } from './test/connect.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp, testLink } from './test/render-app.tsx';

type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

async function libraryWithCover() {
  return new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], hasCover: true }]));
}

async function expectLibraryShown(screen: Screen) {
  await expect.element(screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  await expect
    .element(screen.getByRole('img', { name: 'Cover of Jane Eyre' }))
    .toHaveAttribute('src', expect.stringMatching(/^blob:/));
}

test('connecting asks the browser to keep the cached library', async () => {
  const persist = vi.spyOn(navigator.storage, 'persist').mockResolvedValue(true);
  onTestFinished(() => persist.mockRestore());
  const app = await renderApp({ storage: await libraryWithCover() });

  await connectMega(app.screen, testLink);

  await expectLibraryShown(app.screen);
  expect(persist).toHaveBeenCalledOnce();
});

test('Disconnect forgets the link, the library and the covers on this device', async () => {
  const storage = await libraryWithCover();
  const app = await renderApp({ storage, connected: true });
  await expectLibraryShown(app.screen);

  await chooseFromMenu(app.screen, 'Disconnect');

  await expect.element(chooseScreen(app.screen)).toBeVisible();
  const reloaded = await app.reload();
  await expect.element(chooseScreen(reloaded)).toBeVisible();

  storage.calls.length = 0;
  await connectMega(reloaded, testLink);
  await expectLibraryShown(reloaded);
  expect(storage.calls.filter(({ op }) => op === 'read').map(({ path }) => path)).toEqual([
    'metadata.db',
    'Charlotte Bronte/Jane Eyre (1)/cover.jpg',
  ]);
});

test('a Disconnect that cannot forget the library says so and stays connected', async () => {
  const forget = vi.spyOn(caches, 'delete').mockRejectedValue(new DOMException('Storage is busy', 'InvalidStateError'));
  onTestFinished(() => forget.mockRestore());
  const app = await renderApp({ storage: await libraryWithCover(), connected: true });
  await expectLibraryShown(app.screen);

  await chooseFromMenu(app.screen, 'Disconnect');

  await expect.element(app.screen.getByRole('alert')).toMatchTextContent(/Couldn’t disconnect.*Storage is busy/);
  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  forget.mockRestore();
  await chooseFromMenu(app.screen, 'Disconnect');
  await expect.element(chooseScreen(app.screen)).toBeVisible();
});
