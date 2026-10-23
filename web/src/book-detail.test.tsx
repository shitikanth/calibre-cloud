import { userEvent } from 'vitest/browser';
import { afterEach, expect, test, vi } from 'vitest';
import { QuotaExceeded } from './storage/adapter.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

afterEach(() => {
  vi.restoreAllMocks();
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
  expect(app.location()).toBe('/books/1');
  expect(storage.calls.filter(({ path }) => path === 'metadata.db')).toHaveLength(1);

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
        series: { name: 'Earthsea', index: 1.5 },
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

function captureDownloads() {
  const createObjectURL = vi.spyOn(URL, 'createObjectURL');
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return () =>
    (click.mock.contexts as HTMLAnchorElement[]).map((anchor) => {
      const index = createObjectURL.mock.results.findIndex(({ value }) => value === anchor.href);
      return { filename: anchor.download, blob: createObjectURL.mock.calls[index]?.[0] as Blob };
    });
}

test('each format is listed with its size and downloads straight to the device', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      {
        title: 'Jane Eyre',
        authors: ['Charlotte Brontë', 'Emily Brontë'],
        formats: { EPUB: 'fake epub bytes', PDF: 'p'.repeat(2048) },
      },
    ]),
  );
  const downloads = captureDownloads();
  const app = await renderApp({ storage, connected: true, path: '/books/1' });
  const formats = app.screen.getByRole('list', { name: 'Formats' }).getByRole('listitem');

  await expect.element(formats.first()).toBeVisible();
  expect(formats.elements().map((format) => format.textContent)).toEqual([
    'EPUB15 BDownload EPUB',
    'PDF2.0 KBDownload PDF',
  ]);

  await userEvent.click(app.screen.getByRole('button', { name: 'Download EPUB' }));

  await expect.poll(() => downloads()).toHaveLength(1);
  const [saved] = downloads();
  expect(saved?.filename).toBe('Jane Eyre - Charlotte Brontë & Emily Brontë.epub');
  expect(await saved?.blob.text()).toBe('fake epub bytes');
});

test('a download shows its progress and can be cancelled without an error', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { PDF: 'fake pdf' } }]),
  );
  const held = storage.holdNextRead('Charlotte Bronte/Jane Eyre (1)/Jane Eyre - Charlotte Bronte.pdf');
  const downloads = captureDownloads();
  const app = await renderApp({ storage, connected: true, path: '/books/1' });

  await userEvent.click(app.screen.getByRole('button', { name: 'Download PDF' }));
  await held.started;
  await expect.element(app.screen.getByRole('progressbar', { name: 'Downloading PDF' })).toBeVisible();
  await expect.element(app.screen.getByText('50%')).toBeVisible();

  await userEvent.click(app.screen.getByRole('button', { name: 'Cancel' }));

  await expect.element(app.screen.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  expect(app.screen.getByRole('progressbar').query()).toBeNull();
  held.release();
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(app.screen.getByRole('alert').query()).toBeNull();
  expect(downloads()).toEqual([]);
});

test('a failed download says why and the owner can try again', async () => {
  const path = 'Charlotte Bronte/Jane Eyre (1)/Jane Eyre - Charlotte Bronte.epub';
  const storage = new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: 'fake epub' } }]),
  );
  storage.failWith(path, new QuotaExceeded());
  const downloads = captureDownloads();
  const app = await renderApp({ storage, connected: true, path: '/books/1' });

  await userEvent.click(app.screen.getByRole('button', { name: 'Download EPUB' }));
  await expect.element(app.screen.getByRole('alert')).toMatchTextContent(/quota exceeded/i);

  storage.heal(path);
  await userEvent.click(app.screen.getByRole('button', { name: 'Download EPUB' }));
  await expect.poll(() => downloads()).toHaveLength(1);
  expect(app.screen.getByRole('alert').query()).toBeNull();
});

test('fields the book doesn’t have are left out', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary([{ title: 'Poems', authors: ['Emily Brontë'] }]));
  const app = await renderApp({ storage, connected: true, path: '/books/1' });

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Poems' })).toBeVisible();
  expect(shownFields(app.screen)).toEqual({});
});
