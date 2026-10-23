import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

afterEach(async () => {
  await page.viewport(414, 896);
});

async function bronteLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'] },
      { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'] },
      { title: 'Wuthering Heights', authors: ['Emily Brontë'] },
    ]),
  );
}

function appBar(screen: Screen) {
  return screen.getByRole('banner');
}

async function expectAppBar(screen: Screen) {
  await expect.element(appBar(screen).getByRole('link', { name: 'calibre-cloud' })).toBeVisible();
  await expect.element(appBar(screen).getByRole('searchbox', { name: 'Search books' })).toBeVisible();
  await expect.element(appBar(screen).getByRole('button', { name: 'More' })).toBeVisible();
}

test('the library and detail pages show the same app bar', async () => {
  const storage = await bronteLibrary();
  const app = await renderApp({ storage, connected: true });
  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  await expectAppBar(app.screen);

  await userEvent.click(app.screen.getByRole('link', { name: /Jane Eyre/ }));

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Jane Eyre' })).toBeVisible();
  await expectAppBar(app.screen);
});

test('the connect screen has no app bar', async () => {
  const app = await renderApp({ storage: await bronteLibrary() });

  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
  expect(app.screen.getByRole('banner').query()).toBeNull();
});

async function expectTitles(screen: Screen, titles: string[]) {
  await expect
    .poll(() =>
      screen
        .getByRole('heading', { level: 2 })
        .elements()
        .map((element) => element.textContent)
        .sort(),
    )
    .toEqual([...titles].sort());
}

function searchBox(screen: Screen) {
  return appBar(screen).getByRole('searchbox', { name: 'Search books' });
}

test('the app name takes the user back to the whole library', async () => {
  const app = await renderApp({ storage: await bronteLibrary(), connected: true, path: '/?q=eyre' });
  await expectTitles(app.screen, ['Jane Eyre']);
  await userEvent.click(app.screen.getByRole('link', { name: /Jane Eyre/ }));
  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Jane Eyre' })).toBeVisible();
  await expect.element(searchBox(app.screen)).toHaveValue('');

  await userEvent.click(appBar(app.screen).getByRole('link', { name: 'calibre-cloud' }));

  await expectTitles(app.screen, ['Jane Eyre', 'A Wizard of Earthsea', 'Wuthering Heights']);
  expect(app.url).toBe('/');
});

test('searching from a detail page lands on the library filtered by that term', async () => {
  const app = await renderApp({ storage: await bronteLibrary(), connected: true, path: '/books/1' });
  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Jane Eyre' })).toBeVisible();

  await userEvent.type(searchBox(app.screen), 'earthsea');

  await expectTitles(app.screen, ['A Wizard of Earthsea']);
  expect(app.url).toBe('/?q=earthsea');
  await expect.element(searchBox(app.screen)).toHaveValue('earthsea');
});

test('the browser back button restores the search the box was showing', async () => {
  const app = await renderApp({ storage: await bronteLibrary(), connected: true, path: '/?q=eyre' });
  await expectTitles(app.screen, ['Jane Eyre']);
  await userEvent.click(app.screen.getByRole('link', { name: /Jane Eyre/ }));
  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Jane Eyre' })).toBeVisible();

  app.back();

  await expectTitles(app.screen, ['Jane Eyre']);
  await expect.element(searchBox(app.screen)).toHaveValue('eyre');
});
