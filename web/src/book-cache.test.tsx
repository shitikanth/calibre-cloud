import { expect, test } from 'vitest';
import { Network } from './storage/adapter.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp, unmountApps } from './test/render-app.tsx';

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

test('a book file changed in the library downloads again and the new copy opens', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  storage.put(janeEyreEpubPath, '# Chapter 1, revised\nReader, I married him.', '2');
  storage.calls.length = 0;

  const reloaded = await app.reload();

  await expect.element(reloaded.getByText('# Chapter 1, revised')).toBeVisible();
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat', 'read']);
});

const janeEyrePdfPath = 'Charlotte Bronte/Jane Eyre (1)/Jane Eyre - Charlotte Bronte.pdf';
const wutheringEpubPath = 'Emily Bronte/Wuthering Heights (2)/Wuthering Heights - Emily Bronte.epub';
const wutheringPdfPath = 'Emily Bronte/Wuthering Heights (2)/Wuthering Heights - Emily Bronte.pdf';

type Opened = { path: string; firstLine: string };
const opened: Opened[] = [
  { path: '/books/1/read/EPUB', firstLine: '# Chapter 1' },
  { path: '/books/1/read/PDF', firstLine: 'Page one' },
  { path: '/books/2/read/EPUB', firstLine: '# Chapter 1' },
  { path: '/books/2/read/PDF', firstLine: 'Heights page one' },
];

async function openReader(storage: FakeStorage, fake: ReturnType<typeof fakeRenderers>, { path, firstLine }: Opened) {
  await unmountApps();
  const app = await renderApp({ storage, connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByText(firstLine)).toBeVisible();
  return app;
}

test('opening a fourth book file evicts the least recently opened one', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  for (const book of opened) await openReader(storage, fake, book);
  storage.calls.length = 0;

  for (const book of [...opened].reverse()) await openReader(storage, fake, book);

  expect(bookFileCalls(storage, wutheringPdfPath)).toEqual(['stat']);
  expect(bookFileCalls(storage, wutheringEpubPath)).toEqual(['stat']);
  expect(bookFileCalls(storage, janeEyrePdfPath)).toEqual(['stat']);
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat', 'read']);
});

test('a cached book still opens when the library cannot be reached', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  storage.failWith(janeEyreEpubPath, new Network(), 'stat');
  storage.calls.length = 0;

  const reloaded = await app.reload();

  await expect.element(reloaded.getByText('# Chapter 1')).toBeVisible();
  expect(reloaded.getByRole('alert').query()).toBeNull();
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat']);
});

test('a file the renderer cannot open is downloaded afresh next time', async () => {
  const storage = await library();
  let failOpen = true;
  const fake = fakeRenderers(['EPUB', 'PDF'], (renderer) => (renderer.failOpen = failOpen));
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByRole('alert')).toMatchTextContent(/Couldn’t open this book/);
  failOpen = false;
  storage.calls.length = 0;

  const reloaded = await app.reload();

  await expect.element(reloaded.getByText('# Chapter 1')).toBeVisible();
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat', 'read']);
});
