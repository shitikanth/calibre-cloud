import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const epub = ['# Chapter 1', 'Reader, I married him.', '# Chapter II', 'The end.'].join('\n');

async function janeEyreLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub, PDF: 'Page one\nPage two\nPage three', MOBI: 'mobi' } },
    ]),
  );
}

test('EPUB and PDF formats get a Read button beside Download; other formats only Download', async () => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1', renderers: fake.renderers });
  const formats = app.screen.getByRole('list', { name: 'Formats' }).getByRole('listitem');

  await expect.element(formats.first()).toBeVisible();
  expect(formats.elements().map((format) => format.textContent)).toEqual([
    'EPUB56 BRead EPUBDownload EPUB',
    'MOBI4 BDownload MOBI',
    'PDF28 BRead PDFDownload PDF',
  ]);

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
  await expect.element(app.screen.getByRole('progressbar', { name: 'Downloading EPUB' })).toBeVisible();
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

test('Previous, Next and the arrow keys turn pages, and the chrome shows how far along the reader is', async () => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });

  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  await expect.element(app.screen.getByText('0%')).toBeVisible();

  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));
  await expect.element(app.screen.getByText('Reader, I married him.')).toBeVisible();
  await expect.element(app.screen.getByText('33%')).toBeVisible();

  await userEvent.keyboard('{ArrowRight}');
  await expect.element(app.screen.getByText('# Chapter II')).toBeVisible();
  await userEvent.keyboard('{ArrowLeft}');
  await expect.element(app.screen.getByText('Reader, I married him.')).toBeVisible();
  await userEvent.click(app.screen.getByRole('button', { name: 'Previous' }));
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  expect(fake.latest.calls.map(({ op }) => op)).toEqual(['next', 'next', 'previous', 'previous']);

  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));
  await expect.element(app.screen.getByRole('button', { name: 'Download EPUB' })).toBeVisible();
  expect(app.url).toBe('/books/1');
  expect(fake.latest.calls.at(-1)).toEqual({ op: 'destroy' });
});

test('a PDF shows its page count instead of a percentage', async () => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path: '/books/1/read/PDF', renderers: fake.renderers });

  await expect.element(app.screen.getByText('Page one')).toBeVisible();
  await expect.element(app.screen.getByText('page 1 of 3')).toBeVisible();
  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));
  await expect.element(app.screen.getByText('page 2 of 3')).toBeVisible();
});

test.each(['/books/99/read/EPUB', '/books/nope/read/EPUB'])('%s says the book was not found', async (path) => {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path, renderers: fake.renderers });

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Book not found' })).toBeVisible();
  await expect.element(app.screen.getByRole('banner').getByRole('link', { name: 'calibre-cloud' })).toBeVisible();
});

test.each(['/books/1/read/MOBI', '/books/1/read/AZW3'])('%s says the format was not found', async (path) => {
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
