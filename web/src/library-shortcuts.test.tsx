import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';
import { expectBooks } from './test/screen.ts';

async function openLibrary() {
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'] },
      { title: 'Wuthering Heights', authors: ['Emily Brontë'] },
    ]),
  );
  const app = await renderApp({ storage, connected: true });
  await expectBooks(app.screen, ['Jane Eyre', 'Wuthering Heights']);
  return app.screen;
}

test('/ focuses the library search, and typing / in it types a /', async () => {
  const screen = await openLibrary();
  const box = screen.getByRole('searchbox', { name: 'Search books' });
  await expect.element(box).toHaveAttribute('aria-keyshortcuts', '/');

  await userEvent.keyboard('/');

  await expect.element(box).toHaveFocus();
  await expect.element(box).toHaveValue('');

  await userEvent.keyboard('a/b');

  await expect.element(box).toHaveValue('a/b');
});

test('/ with Control or Meta held is left to the browser', async () => {
  const screen = await openLibrary();

  await userEvent.keyboard('{Control>}/{/Control}{Meta>}/{/Meta}');

  await expect.element(screen.getByRole('searchbox', { name: 'Search books' })).not.toHaveFocus();
});
