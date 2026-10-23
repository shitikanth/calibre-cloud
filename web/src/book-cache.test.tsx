import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const janeEyreEpub = '# Chapter 1\nReader, I married him.';
const janeEyrePdf = 'Page one\nPage two';
const wutheringEpub = '# Chapter 1\nI have just returned from a visit to my landlord.';
const wutheringPdf = 'Heights page one\nHeights page two';

const janeEyre = { title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: janeEyreEpub, PDF: janeEyrePdf } };
const wutheringHeights = {
  title: 'Wuthering Heights',
  authors: ['Emily Brontë'],
  formats: { EPUB: wutheringEpub, PDF: wutheringPdf },
};

const janeEyreEpubPath = 'Charlotte Bronte/Jane Eyre (1)/Jane Eyre - Charlotte Bronte.epub';

async function library() {
  return new FakeStorage(await buildCalibreLibrary([janeEyre, wutheringHeights]));
}

function bookFileCalls(storage: FakeStorage, path: string) {
  return storage.calls.filter((call) => call.path === path).map(({ op }) => op);
}

test('a book opened before opens from the device on the next visit', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  storage.calls.length = 0;

  const reloaded = await app.reload();

  await expect.element(reloaded.getByText('# Chapter 1')).toBeVisible();
  expect(await fake.latest.opened?.blob.text()).toBe(janeEyreEpub);
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat']);
});
