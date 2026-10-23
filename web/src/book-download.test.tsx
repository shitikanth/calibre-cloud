import { userEvent } from 'vitest/browser';
import { afterEach, expect, test, vi } from 'vitest';
import { QuotaExceeded } from './storage/adapter.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

afterEach(() => {
  vi.restoreAllMocks();
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
    'EPUB15 BRead EPUBDownload EPUB',
    'PDF2.0 KBRead PDFDownload PDF',
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
