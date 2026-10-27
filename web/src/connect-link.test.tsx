import { userEvent } from 'vitest/browser';
import { expect, onTestFinished, test, vi } from 'vitest';
import { chooseFromMenu } from './test/app-bar.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp, testLink, unmountApps } from './test/render-app.tsx';
import type { Screen } from './test/screen.ts';

async function oneBookLibrary() {
  return new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'] }]));
}

function linkInput(screen: Screen) {
  return screen.getByRole('textbox', { name: 'MEGA folder link' });
}

test('a connect link fills in the connect screen and waits for Connect', async () => {
  const app = await renderApp({ storage: await oneBookLibrary(), path: `/#connect=${encodeURIComponent(testLink)}` });

  await expect.element(linkInput(app.screen)).toHaveValue(testLink);
  expect(app.opened).toEqual([]);
  expect(app.url).toBe('/');

  await userEvent.click(app.screen.getByRole('button', { name: 'Connect' }));

  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  expect(app.opened).toEqual([{ provider: 'mega', link: testLink }]);
});

test('a connect link works unencoded, the MEGA key’s own # included', async () => {
  const app = await renderApp({ storage: await oneBookLibrary(), path: `/books/1#connect=${testLink}` });

  await expect.element(linkInput(app.screen)).toHaveValue(testLink);
  expect(app.url).toBe('/books/1');
});

test('a connect link no provider accepts shows the MEGA problem message', async () => {
  const app = await renderApp({ storage: await oneBookLibrary(), path: '/#connect=https://mega.nz/folder/TestHandle%' });

  await expect.element(linkInput(app.screen)).toHaveValue('https://mega.nz/folder/TestHandle%');
  await expect.element(linkInput(app.screen)).toHaveAttribute('aria-invalid', 'true');
  await expect.element(app.screen.getByRole('alert')).toMatchTextContent(/isn’t a MEGA folder link/);
  expect(app.opened).toEqual([]);
});

const otherLink = 'https://mega.nz/folder/OtherHandle#OtherKey';

async function expectLibraryShown(screen: Screen) {
  await expect.element(screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
}

test('a connect link for the library already connected changes nothing', async () => {
  const app = await renderApp({ storage: await oneBookLibrary(), connected: true, path: `/#connect=${testLink}` });

  await expectLibraryShown(app.screen);
  expect(app.url).toBe('/');
  expect(app.screen.getByRole('dialog').query()).toBeNull();
  expect(app.opened).toEqual([{ provider: 'mega', link: testLink }]);
});

test('a connect link for another library switches to it once confirmed', async () => {
  const storage = await oneBookLibrary();
  const app = await renderApp({ storage, connected: true, path: `/#connect=${encodeURIComponent(otherLink)}` });
  await expectLibraryShown(app.screen);
  const dialog = app.screen.getByRole('dialog', { name: 'Switch to this library?' });
  await expect.element(dialog).toBeVisible();
  storage.calls.length = 0;

  await userEvent.click(dialog.getByRole('button', { name: 'Switch' }));

  await expect.element(dialog).not.toBeInTheDocument();
  await expectLibraryShown(app.screen);
  expect(app.opened).toEqual([
    { provider: 'mega', link: testLink },
    { provider: 'mega', link: otherLink },
  ]);
  expect(storage.calls).toContainEqual({ op: 'read', path: 'metadata.db' });
  await app.reload();
  expect(app.opened.at(-1)).toEqual({ provider: 'mega', link: otherLink });
});

test('cancelling the switch keeps the library connected now', async () => {
  const app = await renderApp({ storage: await oneBookLibrary(), connected: true, path: `/#connect=${otherLink}` });
  const dialog = app.screen.getByRole('dialog', { name: 'Switch to this library?' });

  await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }));

  await expect.element(dialog).not.toBeInTheDocument();
  await expectLibraryShown(app.screen);
  await app.reload();
  expect(app.opened).toEqual([
    { provider: 'mega', link: testLink },
    { provider: 'mega', link: testLink },
  ]);
});

test('once connected, the link no longer fills the connect screen', async () => {
  const app = await renderApp({ storage: new FakeStorage(), path: `/#connect=${testLink}` });
  await userEvent.click(app.screen.getByRole('button', { name: 'Connect' }));

  await userEvent.click(app.screen.getByRole('button', { name: 'Connect a different library' }));

  await expect.element(linkInput(app.screen)).toHaveValue('');
});

test('a switch that cannot forget the current library says so and stays connected', async () => {
  const forget = vi.spyOn(caches, 'delete').mockRejectedValue(new DOMException('Storage is busy', 'InvalidStateError'));
  onTestFinished(() => forget.mockRestore());
  const app = await renderApp({ storage: await oneBookLibrary(), connected: true, path: `/#connect=${otherLink}` });
  const dialog = app.screen.getByRole('dialog', { name: 'Switch to this library?' });

  await userEvent.click(dialog.getByRole('button', { name: 'Switch' }));

  await expect.element(dialog.getByRole('alert')).toMatchTextContent(/Couldn’t disconnect.*Storage is busy/);
  await expectLibraryShown(app.screen);
  expect(app.opened).toEqual([{ provider: 'mega', link: testLink }]);
  forget.mockRestore();
});

test('Copy connect link copies a link that fills in this library on a fresh browser', async () => {
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  onTestFinished(() => write.mockRestore());
  const app = await renderApp({ storage: await oneBookLibrary(), connected: true });
  await expectLibraryShown(app.screen);

  await chooseFromMenu(app.screen, 'Copy connect link');

  await expect.element(app.screen.getByRole('status')).toHaveTextContent('Link copied');
  const href = `${location.origin}/#connect=${encodeURIComponent(testLink)}`;
  expect(write).toHaveBeenCalledExactlyOnceWith(href);
  await expect.element(app.screen.getByText('Link copied'), { timeout: 5000 }).not.toBeInTheDocument();

  await unmountApps();
  localStorage.clear();
  const fresh = await renderApp({ storage: await oneBookLibrary(), path: href.slice(location.origin.length) });
  await expect.element(linkInput(fresh.screen)).toHaveValue(testLink);
});

test('when the clipboard refuses, Copy connect link shows the link to copy by hand', async () => {
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  onTestFinished(() => write.mockRestore());
  const app = await renderApp({ storage: await oneBookLibrary(), connected: true });
  await expectLibraryShown(app.screen);

  await chooseFromMenu(app.screen, 'Copy connect link');

  const shown = app.screen.getByRole('textbox', { name: 'Connect link' });
  await expect.element(shown).toHaveValue(`${location.origin}/#connect=${encodeURIComponent(testLink)}`);
  await userEvent.click(app.screen.getByRole('button', { name: 'Close' }));
  await expect.element(shown).not.toBeInTheDocument();
});

test('a connect link no provider accepts is ignored while connected', async () => {
  const app = await renderApp({ storage: await oneBookLibrary(), connected: true, path: '/#connect=not-a-link' });

  await expectLibraryShown(app.screen);
  expect(app.url).toBe('/');
  expect(app.screen.getByRole('dialog').query()).toBeNull();
});
