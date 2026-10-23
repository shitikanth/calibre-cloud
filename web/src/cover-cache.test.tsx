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
