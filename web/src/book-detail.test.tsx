import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

afterEach(async () => {
  await page.viewport(414, 896);
});

async function janeEyreLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë', 'Emily Brontë'], hasCover: true },
      { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'] },
    ]),
  );
}

function shownFields(screen: Awaited<ReturnType<typeof renderApp>>['screen']) {
  const terms = screen.getByRole('term').elements();
  const definitions = screen.getByRole('definition').elements();
  return Object.fromEntries(terms.map((term, index) => [term.textContent, definitions[index]?.textContent]));
}

test('clicking a book opens its detail page, which survives a reload', async () => {
  const storage = await janeEyreLibrary();
  const app = await renderApp({ storage, connected: true });

  await userEvent.click(app.screen.getByRole('link', { name: /Jane Eyre/ }));

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Jane Eyre' })).toBeVisible();
  await expect.element(app.screen.getByText('Charlotte Brontë & Emily Brontë')).toBeVisible();
  expect(app.url).toBe('/books/1');
  expect(storage.calls.filter(({ op, path }) => op === 'read' && path === 'metadata.db')).toHaveLength(1);

  const reloaded = await app.reload();

  await expect.element(reloaded.getByRole('heading', { level: 1, name: 'Jane Eyre' })).toBeVisible();
  await expect.element(reloaded.getByRole('img', { name: 'Cover of Jane Eyre' })).toHaveAttribute(
    'src',
    expect.stringMatching(/^blob:/),
  );
});

test('the detail page shows the metadata Calibre holds for the book', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      {
        title: 'A Wizard of Earthsea',
        authors: ['Ursula K. Le Guin'],
        series: 'Earthsea',
        seriesIndex: 1.5,
        tags: ['Fantasy', 'Classics'],
        publisher: 'Parnassus Press',
        languages: ['eng'],
        published: '1968-11-01 00:00:00+00:00',
        description: '<p>A boy called <b>Sparrowhawk</b>.</p>',
      },
    ]),
  );
  const app = await renderApp({ storage, connected: true, path: '/books/1' });

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'A Wizard of Earthsea' })).toBeVisible();
  await expect.element(app.screen.getByText('Ursula K. Le Guin')).toBeVisible();
  expect(shownFields(app.screen)).toEqual({
    Series: 'Book 1.5 of Earthsea',
    Tags: 'Fantasy, Classics',
    Publisher: 'Parnassus Press',
    Language: 'English',
    Published: expect.stringMatching(/1968/),
  });
  await expect.element(app.screen.getByRole('img', { name: 'No cover for A Wizard of Earthsea' })).toBeVisible();
  await expect.element(app.screen.getByText('Sparrowhawk')).toBeVisible();
});

test('the description keeps its formatting but nothing in it runs', async () => {
  const description = [
    '<p>An <b>orphan</b> <a href="javascript:window.ranScript=1">governess</a>.</p>',
    '<script>window.ranScript = 1</script>',
    '<img src="x" onerror="window.ranScript = 1">',
    '<p style="color: red" onclick="window.ranScript = 1">Reader, I married him.</p>',
  ].join('');
  const storage = new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], description }]),
  );
  const app = await renderApp({ storage, connected: true, path: '/books/1' });

  const shown = app.screen.getByRole('region', { name: 'Description' });
  await expect.element(shown.getByText('orphan')).toBeVisible();
  expect(shown.getByText('orphan').element().tagName).toBe('B');
  await userEvent.click(shown.getByText('Reader, I married him.'));
  await new Promise((resolve) => setTimeout(resolve, 100));

  const html = shown.element().innerHTML;
  expect(html).not.toMatch(/<script|<img|onerror|onclick|style=|javascript:/i);
  expect((window as { ranScript?: number }).ranScript).toBeUndefined();
});

test.each(['/books/99', '/books/not-a-number'])('%s shows that the book was not found', async (path) => {
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path });

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Book not found' })).toBeVisible();
  await userEvent.click(app.screen.getByRole('link', { name: '← Library' }));
  await expect.element(app.screen.getByText('2 books')).toBeVisible();
});

test('the detail page fits a narrow phone screen', async () => {
  await page.viewport(320, 640);
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      {
        title: 'Supercalifragilisticexpialidociousnessbookwithnospaces',
        authors: ['Ursula K. Le Guin'],
        tags: ['Fantasy', 'Classics', 'Coming of age', 'Wizards'],
        description: '<p>Averyveryverylongwordwithoutanyspacesthatcouldoverflowthescreen in the description.</p>',
        formats: { EPUB: 'epub', ORIGINAL_EPUB: 'original epub', PDF: 'pdf' },
      },
    ]),
  );
  const app = await renderApp({ storage, connected: true, path: '/books/1' });

  await expect.element(app.screen.getByRole('button', { name: 'Download ORIGINAL_EPUB' })).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
});

test('fields the book doesn’t have are left out', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary([{ title: 'Poems', authors: ['Emily Brontë'] }]));
  const app = await renderApp({ storage, connected: true, path: '/books/1' });

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Poems' })).toBeVisible();
  expect(shownFields(app.screen)).toEqual({});
});
