import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

async function principlesLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Principles', authors: ['Dalio| Ray'] },
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'] },
    ]),
  );
}

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

test('a comma Calibre stored as a pipe is restored on the grid tile and the detail page', async () => {
  const app = await renderApp({ storage: await principlesLibrary(), connected: true });

  await expect.element(app.screen.getByText('Dalio, Ray')).toBeVisible();
  await expect.element(app.screen.getByText('Charlotte Brontë')).toBeVisible();
  expect(app.screen.getByText(/\|/).query()).toBeNull();

  await userEvent.click(app.screen.getByRole('link', { name: /Principles/ }));

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Principles' })).toBeVisible();
  await expect.element(app.screen.getByText('Dalio, Ray')).toBeVisible();
  expect(app.screen.getByText(/\|/).query()).toBeNull();
});

test('search finds the author by surname and by the restored spelling', async () => {
  const app = await renderApp({ storage: await principlesLibrary(), connected: true });
  const box = app.screen.getByRole('searchbox', { name: 'Search books' });

  await userEvent.type(box, 'dalio');
  await expectTitles(app.screen, ['Principles']);

  await userEvent.clear(box);
  await userEvent.type(box, 'dalio, ray');
  await expectTitles(app.screen, ['Principles']);
});
