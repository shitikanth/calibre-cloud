import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp, testLink } from './test/render-app.tsx';
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
