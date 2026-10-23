import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

function tileTitles(screen: Awaited<ReturnType<typeof renderApp>>['screen']) {
  return screen
    .getByRole('heading', { level: 2 })
    .elements()
    .map((element) => element.textContent);
}

test('the grid lists books newest added first with their authors in Calibre’s order', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'], added: '2024-01-01 10:00:00+00:00' },
      { title: 'Poems', authors: ['Emily Brontë', 'Anne Brontë', 'Charlotte Brontë'], added: '2024-03-01 10:00:00+00:00' },
      { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'], added: '2024-02-01 10:00:00.123456+00:00' },
    ]),
  );
  const app = await renderApp({ storage, connected: true });

  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Poems' })).toBeVisible();
  expect(tileTitles(app.screen)).toEqual(['Poems', 'A Wizard of Earthsea', 'Jane Eyre']);
  await expect.element(app.screen.getByText('Emily Brontë & Anne Brontë & Charlotte Brontë')).toBeVisible();
  await expect.element(app.screen.getByText('Ursula K. Le Guin')).toBeVisible();
});

test('a book without a cover shows a placeholder with its title and no cover is requested', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([{ title: 'Wuthering Heights', authors: ['Emily Brontë'], hasCover: false }]),
  );
  storage.put('Emily Bronte/Wuthering Heights (1)/cover.jpg', 'stale cover left on disk');
  const app = await renderApp({ storage, connected: true });

  const placeholder = app.screen.getByRole('img', { name: 'No cover for Wuthering Heights' });
  await expect.element(placeholder).toBeVisible();
  await expect.element(placeholder).toHaveTextContent('Wuthering Heights');
  expect(storage.calls.filter(({ path }) => path.endsWith('cover.jpg'))).toEqual([]);
});
