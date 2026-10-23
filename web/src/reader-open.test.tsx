import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const epub = ['# Chapter 1', 'Reader, I married him.', '# Chapter 2', 'The end.'].join('\n');

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
    'EPUB55 BRead EPUBDownload EPUB',
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
