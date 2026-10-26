import { expect, onTestFinished, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Network } from './storage/adapter.ts';
import { chooseFromMenu } from './test/app-bar.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp, testLink, unmountApps } from './test/render-app.tsx';

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

const [janeEyreEpubReader, janeEyrePdfReader, wutheringEpubReader, wutheringPdfReader] = opened as [Opened, Opened, Opened, Opened];

test('opening a fourth book file evicts the least recently opened one', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  for (const book of [janeEyreEpubReader, janeEyrePdfReader, wutheringEpubReader]) await openReader(storage, fake, book);
  await openReader(storage, fake, janeEyreEpubReader);
  await openReader(storage, fake, wutheringPdfReader);
  storage.calls.length = 0;

  for (const book of [wutheringPdfReader, wutheringEpubReader, janeEyreEpubReader, janeEyrePdfReader])
    await openReader(storage, fake, book);

  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat']);
  expect(bookFileCalls(storage, janeEyrePdfPath)).toEqual(['stat', 'read']);
  expect(bookFileCalls(storage, wutheringEpubPath)).toEqual(['stat']);
  expect(bookFileCalls(storage, wutheringPdfPath)).toEqual(['stat']);
});

test('a book opened while the library cannot be reached counts as recently opened', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  for (const book of [janeEyreEpubReader, janeEyrePdfReader, wutheringEpubReader]) await openReader(storage, fake, book);
  storage.failWith(janeEyreEpubPath, new Network(), 'stat');
  await openReader(storage, fake, janeEyreEpubReader);
  storage.heal(janeEyreEpubPath);
  await openReader(storage, fake, wutheringPdfReader);
  storage.calls.length = 0;

  await openReader(storage, fake, janeEyreEpubReader);
  await openReader(storage, fake, janeEyrePdfReader);

  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat']);
  expect(bookFileCalls(storage, janeEyrePdfPath)).toEqual(['stat', 'read']);
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

test('a book still opens when the device refuses to keep it, and downloads again next time', async () => {
  const put = vi.spyOn(Cache.prototype, 'put').mockRejectedValue(new DOMException('Quota exceeded', 'QuotaExceededError'));
  onTestFinished(() => put.mockRestore());
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  storage.calls.length = 0;

  const reloaded = await app.reload();

  await expect.element(reloaded.getByText('# Chapter 1')).toBeVisible();
  expect(reloaded.getByRole('alert').query()).toBeNull();
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat', 'read']);
});

test('a book still opens when the device cannot list what it keeps', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1', renderers: fake.renderers });
  await expect.element(app.screen.getByRole('link', { name: 'Read EPUB' })).toBeVisible();
  const keys = vi.spyOn(Cache.prototype, 'keys').mockRejectedValue(new DOMException('Storage unavailable', 'UnknownError'));
  onTestFinished(() => keys.mockRestore());

  await userEvent.click(app.screen.getByRole('link', { name: 'Read EPUB' }));

  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(app.screen.getByRole('alert').query()).toBeNull();
});

test('a book downloads and opens when the device cannot look up what it keeps', async () => {
  const match = vi.spyOn(Cache.prototype, 'match').mockRejectedValue(new DOMException('Storage unavailable', 'UnknownError'));
  onTestFinished(() => match.mockRestore());
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });

  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  expect(app.screen.getByRole('alert').query()).toBeNull();
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat', 'read']);
});

test('a book opens before the device has finished keeping it', async () => {
  const put = vi.spyOn(Cache.prototype, 'put').mockReturnValue(new Promise(() => {}));
  onTestFinished(() => put.mockRestore());
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });

  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  expect(put).toHaveBeenCalled();
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

function silenceDownloads() {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  onTestFinished(() => click.mockRestore());
  return click;
}

test('Download reads from the library even when the reader has the file on the device', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const click = silenceDownloads();
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  storage.calls.length = 0;

  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));
  await userEvent.click(app.screen.getByRole('button', { name: 'Download EPUB' }));

  await expect.poll(() => click.mock.contexts).toHaveLength(1);
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['read']);
});

test('a downloaded file is not on the device for the reader', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const click = silenceDownloads();
  const app = await renderApp({ storage, connected: true, path: '/books/1', renderers: fake.renderers });
  await userEvent.click(app.screen.getByRole('button', { name: 'Download EPUB' }));
  await expect.poll(() => click.mock.contexts).toHaveLength(1);

  await userEvent.click(app.screen.getByRole('link', { name: 'Read EPUB' }));

  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['read', 'stat', 'read']);
});

test('Refresh library drops the files of formats that left the library, and keeps the rest', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  await openReader(storage, fake, { path: '/books/1/read/EPUB', firstLine: '# Chapter 1' });
  const app = await openReader(storage, fake, { path: '/books/2/read/EPUB', firstLine: '# Chapter 1' });
  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));
  await expect.element(app.screen.getByRole('link', { name: 'Read EPUB' })).toBeVisible();

  const withoutEpub = await buildCalibreLibrary([janeEyre, { ...wutheringHeights, formats: { PDF: wutheringPdf } }]);
  storage.put('metadata.db', withoutEpub['metadata.db']!, '2');
  await chooseFromMenu(app.screen, 'Refresh library');
  await expect.element(app.screen.getByRole('link', { name: 'Read EPUB' })).not.toBeInTheDocument();
  const restored = await buildCalibreLibrary([janeEyre, wutheringHeights]);
  storage.put('metadata.db', restored['metadata.db']!, '3');
  await chooseFromMenu(app.screen, 'Refresh library');
  await expect.element(app.screen.getByRole('link', { name: 'Read EPUB' })).toBeVisible();
  storage.calls.length = 0;

  await userEvent.click(app.screen.getByRole('link', { name: 'Read EPUB' }));
  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Wuthering Heights' })).toBeVisible();
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  await openReader(storage, fake, { path: '/books/1/read/EPUB', firstLine: '# Chapter 1' });

  expect(bookFileCalls(storage, wutheringEpubPath)).toEqual(['stat', 'read']);
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat']);
});

test('Disconnect forgets the book files on this device', async () => {
  const storage = await library();
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));

  await chooseFromMenu(app.screen, 'Disconnect');
  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
  storage.calls.length = 0;
  await userEvent.fill(app.screen.getByRole('textbox', { name: 'MEGA folder link' }), testLink);
  await userEvent.click(app.screen.getByRole('button', { name: 'Connect' }));
  await userEvent.click(app.screen.getByRole('link', { name: 'Read EPUB' }));

  await expect.element(app.screen.getByText('# Chapter 1')).toBeVisible();
  expect(bookFileCalls(storage, janeEyreEpubPath)).toEqual(['stat', 'read']);
});
