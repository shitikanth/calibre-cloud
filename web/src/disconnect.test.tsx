import { expect, onTestFinished, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp, testLink } from './test/render-app.tsx';

type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

async function libraryWithCover() {
  return new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], hasCover: true }]));
}

async function connect(screen: Screen) {
  await userEvent.fill(screen.getByRole('textbox', { name: 'MEGA folder link' }), testLink);
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

async function expectLibraryShown(screen: Screen) {
  await expect.element(screen.getByText('1 book')).toBeVisible();
  await expect
    .element(screen.getByRole('img', { name: 'Cover of Jane Eyre' }))
    .toHaveAttribute('src', expect.stringMatching(/^blob:/));
}

test('connecting asks the browser to keep the cached library', async () => {
  const persist = vi.spyOn(navigator.storage, 'persist').mockResolvedValue(true);
  onTestFinished(() => persist.mockRestore());
  const app = await renderApp({ storage: await libraryWithCover() });

  await connect(app.screen);

  await expectLibraryShown(app.screen);
  expect(persist).toHaveBeenCalledOnce();
});

test('Disconnect forgets the link, the library and the covers on this device', async () => {
  const storage = await libraryWithCover();
  const app = await renderApp({ storage, connected: true });
  await expectLibraryShown(app.screen);

  await userEvent.click(app.screen.getByRole('button', { name: 'Disconnect' }));

  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
  const reloaded = await app.reload();
  await expect.element(reloaded.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();

  storage.calls.length = 0;
  await connect(reloaded);
  await expectLibraryShown(reloaded);
  expect(storage.calls.filter(({ op }) => op === 'read').map(({ path }) => path)).toEqual([
    'metadata.db',
    'Charlotte Bronte/Jane Eyre (1)/cover.jpg',
  ]);
});
