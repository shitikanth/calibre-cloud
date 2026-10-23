import { expect, test } from 'vitest';
import { buildCalibreLibrary, type BookSpec } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const added = '2024-01-01 10:00:00+00:00';
const books: BookSpec[] = [
  { title: 'Jane Eyre', authors: ['Charlotte Brontë'], hasCover: true, added },
  { title: 'Wuthering Heights', authors: ['Emily Brontë'], hasCover: true, added },
];

function coverReads(storage: FakeStorage) {
  return storage.calls.filter(({ op, path }) => op === 'read' && path.endsWith('/cover.jpg')).map(({ path }) => path);
}

type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

async function coverText(screen: Screen, title: string): Promise<string> {
  const cover = screen.getByRole('img', { name: `Cover of ${title}` });
  await expect.element(cover).toHaveAttribute('src', expect.stringMatching(/^blob:/));
  const response = await fetch((cover.element() as HTMLImageElement).src);
  return response.text();
}

test('covers seen before come from the device on the next visit', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary(books));
  const app = await renderApp({ storage, connected: true });
  expect(await coverText(app.screen, 'Jane Eyre')).toBe('cover of Jane Eyre');
  expect(await coverText(app.screen, 'Wuthering Heights')).toBe('cover of Wuthering Heights');
  storage.calls.length = 0;

  const reloaded = await app.reload();

  expect(await coverText(reloaded, 'Jane Eyre')).toBe('cover of Jane Eyre');
  expect(await coverText(reloaded, 'Wuthering Heights')).toBe('cover of Wuthering Heights');
  expect(coverReads(storage)).toEqual([]);
});

test('the full-size cover on a detail page is fetched on every visit', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary(books));
  const app = await renderApp({ storage, connected: true, path: '/books/1' });
  expect(await coverText(app.screen, 'Jane Eyre')).toBe('cover of Jane Eyre');

  const reloaded = await app.reload();

  expect(await coverText(reloaded, 'Jane Eyre')).toBe('cover of Jane Eyre');
  expect(coverReads(storage)).toEqual(['Charlotte Bronte/Jane Eyre (1)/cover.jpg', 'Charlotte Bronte/Jane Eyre (1)/cover.jpg']);
});

test('a cover changed in Calibre shows the new image after the library updates', async () => {
  const storage = new FakeStorage(await buildCalibreLibrary(books));
  const app = await renderApp({ storage, connected: true });
  expect(await coverText(app.screen, 'Jane Eyre')).toBe('cover of Jane Eyre');
  expect(await coverText(app.screen, 'Wuthering Heights')).toBe('cover of Wuthering Heights');

  const [janeEyre, wutheringHeights] = books;
  const changed = await buildCalibreLibrary([{ ...janeEyre!, modified: '2024-06-01 09:00:00+00:00' }, wutheringHeights!]);
  storage.put('metadata.db', changed['metadata.db']!, '2');
  storage.put('Charlotte Bronte/Jane Eyre (1)/cover.jpg', 'new cover of Jane Eyre');
  storage.calls.length = 0;
  const download = storage.holdNextRead('metadata.db');

  const reloaded = await app.reload();

  expect(await coverText(reloaded, 'Jane Eyre')).toBe('cover of Jane Eyre');
  await download.started;
  download.release();
  await expect.element(reloaded.getByRole('status')).toHaveTextContent('Library updated');
  await expect.poll(() => coverText(reloaded, 'Jane Eyre')).toBe('new cover of Jane Eyre');
  expect(await coverText(reloaded, 'Wuthering Heights')).toBe('cover of Wuthering Heights');
  expect(coverReads(storage)).toEqual(['Charlotte Bronte/Jane Eyre (1)/cover.jpg']);
});
