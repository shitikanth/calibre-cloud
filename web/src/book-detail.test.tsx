import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

async function janeEyreLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë', 'Emily Brontë'], hasCover: true },
      { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'] },
    ]),
  );
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
