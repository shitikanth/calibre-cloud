import { userEvent } from 'vitest/browser';
import { afterEach, expect, test, vi } from 'vitest';
import { NotFound, QuotaExceeded } from './storage/adapter.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';
import { showControls } from './test/reader.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const epub = ['# Chapter 1', 'Reader, I married him.', '# Chapter II', 'The end.'].join('\n');

async function janeEyreLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub, PDF: 'Page one\nPage two\nPage three', DJVU: 'djvu' } },
    ]),
  );
}

test('formats with a renderer get a Read button beside a Download icon; other formats only the Download icon', async () => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1', renderers: fake.renderers });
  const formats = app.screen.getByRole('list', { name: 'Formats' }).getByRole('listitem');

  await expect.element(formats.first()).toBeVisible();
  expect(formats.elements().map((format) => format.textContent)).toEqual([
    'DJVU4 B',
    'EPUB56 BRead',
    'PDF28 BRead',
  ]);
  expect(formats.nth(0).getByRole('link').query()).toBeNull();
  for (const format of ['DJVU', 'EPUB', 'PDF']) {
    await expect.element(formats.getByRole('button', { name: `Download ${format}` })).toHaveAttribute('title', `Download ${format}`);
  }

  await userEvent.click(app.screen.getByRole('link', { name: 'Read EPUB' }));

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Jane Eyre' })).toBeVisible();
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  expect(app.url).toBe('/books/1/read/EPUB');
  expect(fake.latest.opened?.location).toBeUndefined();
  expect(await fake.latest.opened?.blob.text()).toBe(epub);
});

const epubPath = 'Charlotte Bronte/Jane Eyre (1)/Jane Eyre - Charlotte Bronte.epub';

test('the book file downloads with progress, and Cancel goes back to the book page without opening it', async () => {
  const storage = await janeEyreLibrary();
  const held = storage.holdNextRead(epubPath);
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });

  await held.started;
  await expect.element(app.screen.getByRole('progressbar', { name: 'Downloading EPUB · 56 B' })).toBeVisible();
  await expect.element(app.screen.getByText('Downloading EPUB · 56 B', { exact: true })).toBeVisible();
  await expect.element(app.screen.getByText('50%')).toBeVisible();
  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Jane Eyre' })).toBeVisible();

  await userEvent.click(app.screen.getByRole('button', { name: 'Cancel' }));

  await expect.element(app.screen.getByRole('button', { name: 'Download EPUB' })).toBeVisible();
  expect(app.url).toBe('/books/1');
  held.release();
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(fake.instances).toEqual([]);
  expect(app.screen.getByRole('alert').query()).toBeNull();
});

test('a format of unknown size downloads under its name alone', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { PDF: '' } }]));
  const held = storage.holdNextRead('Charlotte Bronte/Jane Eyre (1)/Jane Eyre - Charlotte Bronte.pdf');
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/PDF', renderers: fakeRenderers(['PDF']).renderers });

  await held.started;
  await expect.element(app.screen.getByRole('progressbar', { name: 'Downloading PDF' })).toBeVisible();
  await expect.element(app.screen.getByText('Downloading PDF', { exact: true })).toBeVisible();
  held.release();
});

test('Previous, Next and the arrow keys turn pages, and the chrome shows how far along the reader is', async () => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });

  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  await expect.element(app.screen.getByText('0%')).toBeVisible();

  await userEvent.click(app.screen.getByRole('button', { name: 'Next page' }));
  await expect.element(app.screen.getByText('Reader, I married him.')).toBeVisible();
  await expect.element(app.screen.getByText('33%')).toBeVisible();

  await userEvent.keyboard('{ArrowRight}');
  await expect.element(app.screen.getByText('# Chapter II')).toBeVisible();
  await userEvent.keyboard('{ArrowLeft}');
  await expect.element(app.screen.getByText('Reader, I married him.')).toBeVisible();
  await userEvent.click(app.screen.getByRole('button', { name: 'Previous page' }));
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  expect(fake.latest.calls.map(({ op }) => op).filter((op) => op === 'next' || op === 'previous')).toEqual(['next', 'next', 'previous', 'previous']);

  await showControls(app.screen);
  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));
  await expect.element(app.screen.getByRole('button', { name: 'Download EPUB' })).toBeVisible();
  expect(app.url).toBe('/books/1');
  expect(fake.latest.calls.at(-1)).toEqual({ op: 'destroy' });
});

test('the arrow keys leave the page alone while the table of contents or Settings is open', async () => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  const turns = () => fake.latest.calls.filter(({ op }) => op === 'next' || op === 'previous');

  await showControls(app.screen);
  await userEvent.click(app.screen.getByRole('button', { name: 'Table of contents' }));
  await expect.element(app.screen.getByRole('navigation', { name: 'Table of contents' })).toBeVisible();
  await userEvent.keyboard('{ArrowRight}');
  await userEvent.keyboard('{Escape}');

  await showControls(app.screen);
  await userEvent.click(app.screen.getByRole('button', { name: 'Settings' }));
  const settings = app.screen.getByRole('dialog', { name: 'Settings' });
  await expect.element(settings).toBeVisible();
  await userEvent.click(settings.getByRole('radio', { name: 'Light' }));
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(settings.getByRole('radio', { name: 'Sepia' })).toBeChecked();
  await userEvent.keyboard('{ArrowLeft}');
  await expect.element(settings.getByRole('radio', { name: 'Light' })).toBeChecked();
  await userEvent.keyboard('{Escape}');

  expect(turns()).toEqual([]);
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(app.screen.getByText('Reader, I married him.')).toBeVisible();
});

test('a PDF shows its page count instead of a percentage', async () => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1/read/PDF', renderers: fake.renderers });

  await expect.element(app.screen.getByText('Page one')).toBeVisible();
  await expect.element(app.screen.getByRole('main').getByText('page 1 of 3', { exact: true })).toBeVisible();
  await userEvent.click(app.screen.getByRole('button', { name: 'Next page' }));
  await expect.element(app.screen.getByRole('main').getByText('page 2 of 3', { exact: true })).toBeVisible();
});

test.each(['/books/99/read/EPUB', '/books/nope/read/EPUB'])('%s says the book was not found', async (path) => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path, renderers: fake.renderers });

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Book not found' })).toBeVisible();
  await expect.element(app.screen.getByRole('banner').getByRole('link', { name: 'calibre-cloud' })).toBeVisible();
});

test.each(['/books/1/read/DJVU', '/books/1/read/TXT'])('%s says the format was not found', async (path) => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path, renderers: fake.renderers });

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Format not found' })).toBeVisible();
  expect(fake.instances).toEqual([]);
});

test('the reader route asks to connect first when there is no connection', async () => {
  const app = await renderApp({ storage: await janeEyreLibrary(), path: '/books/1/read/EPUB' });

  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
  expect(app.url).toBe('/books/1/read/EPUB');
});

test('a fetch that fails says why, offers Retry when that can work, and always offers Back to book', async () => {
  const storage = await janeEyreLibrary();
  storage.failWith(epubPath, new QuotaExceeded());
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });

  const alert = app.screen.getByRole('alert');
  await expect.element(alert).toMatchTextContent(/Download quota exceeded.*Try later/);
  await expect.element(alert.getByRole('link', { name: 'Back to book' })).toBeVisible();
  expect(app.screen.getByRole('progressbar').query()).toBeNull();

  storage.heal(epubPath);
  await userEvent.click(alert.getByRole('button', { name: 'Retry' }));

  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  expect(app.screen.getByRole('alert').query()).toBeNull();
});

test('a missing file cannot be retried', async () => {
  const storage = await janeEyreLibrary();
  storage.failWith(epubPath, new NotFound(epubPath));
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });

  const alert = app.screen.getByRole('alert');
  await expect.element(alert).toMatchTextContent(/File missing/);
  await expect.element(alert.getByRole('link', { name: 'Back to book' })).toBeVisible();
  expect(alert.getByRole('button', { name: 'Retry' }).query()).toBeNull();
});

test('a file the renderer cannot open offers Download instead of Retry', async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const fake = fakeRenderers(['EPUB', 'PDF'], (renderer) => (renderer.failOpen = true));
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });

  const alert = app.screen.getByRole('alert');
  await expect.element(alert).toMatchTextContent(/Couldn’t open this book/);
  await expect.element(alert.getByRole('link', { name: 'Back to book' })).toBeVisible();
  expect(alert.getByRole('button', { name: 'Retry' }).query()).toBeNull();
  expect(app.screen.getByRole('button', { name: 'Next page' }).query()).toBeNull();

  await userEvent.click(alert.getByRole('button', { name: 'Download EPUB' }));

  await expect.poll(() => click.mock.contexts).toHaveLength(1);
  expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('Jane Eyre - Charlotte Brontë.epub');
});

test('a renderer that fails to load offers Retry and Back to book, and Retry opens the book', async () => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  fake.failCreate = new TypeError('Failed to fetch dynamically imported module');
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });

  const alert = app.screen.getByRole('alert');
  await expect.element(alert).toMatchTextContent(/Couldn’t load the reader/);
  await expect.element(alert.getByRole('link', { name: 'Back to book' })).toBeVisible();
  expect(alert.getByRole('button', { name: 'Download EPUB' }).query()).toBeNull();

  fake.failCreate = undefined;
  await userEvent.click(alert.getByRole('button', { name: 'Retry' }));

  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  expect(app.screen.getByRole('alert').query()).toBeNull();
});

test('a page that fails to render shows a notice while the book stays open', async () => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();

  fake.latest.emitRenderError(new Error('Bad section'));

  await expect.element(app.screen.getByRole('alert')).toMatchTextContent(/couldn’t be shown/);
  await userEvent.click(app.screen.getByRole('button', { name: 'Next page' }));
  await expect.element(app.screen.getByText('Reader, I married him.')).toBeVisible();
  expect(app.screen.getByRole('alert').query()).toBeNull();
});

test('every format foliate-js or pdf.js reads gets a Read button; DJVU and TXT stay download-only', async () => {
  const readable = ['AZW', 'AZW3', 'CBZ', 'EPUB', 'FB2', 'FBZ', 'KEPUB', 'KF8', 'MOBI', 'PDF', 'PRC'];
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      {
        title: 'Jane Eyre',
        authors: ['Charlotte Brontë'],
        formats: Object.fromEntries([...readable, 'DJVU', 'TXT'].map((format) => [format, format])),
      },
    ]),
  );
  const app = await renderApp({ storage, connected: true, path: '/books/1' });

  await expect.element(app.screen.getByRole('link', { name: 'Read EPUB' })).toBeVisible();
  const links = app.screen.getByRole('list', { name: 'Formats' }).getByRole('link');
  expect(links.elements().map((link) => link.getAttribute('aria-label'))).toEqual(readable.map((format) => `Read ${format}`));
});
