import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { buildCalibreLibrary, type BookSpec } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

afterEach(async () => {
  await page.viewport(414, 896);
});

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

function numberedBooks(count: number, extra: Partial<BookSpec> = {}): BookSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Book ${index + 1}`,
    added: new Date(Date.UTC(2024, 0, 1) + index * 3_600_000).toISOString().replace('T', ' ').replace('Z', '+00:00'),
    ...extra,
  }));
}

test('covers load from the library as tiles scroll into view', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary(numberedBooks(20, { hasCover: true })));
  const coverReads = (book: number) =>
    storage.calls.filter(({ op, path }) => op === 'read' && path.endsWith(`/Book ${book} (${book})/cover.jpg`));
  const app = await renderApp({ storage, connected: true });

  const newest = app.screen.getByRole('img', { name: 'Cover of Book 20' });
  await expect.element(newest).toBeVisible();
  await expect.element(newest).toHaveAttribute('src', expect.stringMatching(/^blob:/));
  expect(coverReads(1)).toEqual([]);

  await app.screen.getByRole('heading', { name: 'Book 1', exact: true }).element().scrollIntoView();

  const oldest = app.screen.getByRole('img', { name: 'Cover of Book 1' });
  await expect.element(oldest).toBeVisible();
  await expect.element(oldest).toHaveAttribute('src', expect.stringMatching(/^blob:/));
  expect(coverReads(1)).toHaveLength(1);
});

test('the grid fits a narrow phone screen in two columns', async () => {
  await page.viewport(320, 640);
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Supercalifragilisticexpialidociousnessbookwithnospaces', authors: ['Ursula K. Le Guin'] },
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'] },
      { title: 'Poems', authors: ['Emily Brontë'] },
    ]),
  );
  const app = await renderApp({ storage, connected: true });

  const tiles = app.screen.getByRole('listitem');
  await expect.element(tiles.first()).toBeVisible();
  const [first, second, third] = tiles.elements().map((tile) => tile.getBoundingClientRect());
  expect(second!.top).toBe(first!.top);
  expect(third!.top).toBeGreaterThan(first!.bottom);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
});

test('more books load as the owner scrolls to the end of the grid', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary(numberedBooks(150)));
  const app = await renderApp({ storage, connected: true });

  await expect.element(app.screen.getByRole('heading', { name: 'Book 150', exact: true })).toBeVisible();
  expect(app.screen.getByRole('heading', { name: 'Book 1', exact: true }).query()).toBeNull();

  await expect
    .poll(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return app.screen.getByRole('heading', { name: 'Book 1', exact: true }).query();
    })
    .not.toBeNull();
  expect(tileTitles(app.screen)).toEqual(numberedBooks(150).map(({ title }) => title).reverse());
});
