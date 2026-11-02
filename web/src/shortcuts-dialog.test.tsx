import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';
import type { Screen } from './test/screen.ts';

async function janeEyreLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: '# Chapter one\nline 2' } }]),
  );
}

async function openApp(path: string) {
  const fake = fakeRenderers(['EPUB']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path, renderers: fake.renderers });
  return app.screen;
}

function shortcutsDialog(screen: Screen) {
  return screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
}

async function expectClosed(screen: Screen) {
  await expect.poll(() => shortcutsDialog(screen).query()).toBeNull();
}

test('? on the library opens the shortcuts, grouped as Library and Reader, and Esc closes them and gives focus back', async () => {
  const screen = await openApp('/');
  const tile = screen.getByRole('link', { name: /Jane Eyre/ });
  await expect.element(tile).toBeVisible();
  (tile.element() as HTMLElement).focus();

  await userEvent.keyboard('?');

  const dialog = shortcutsDialog(screen);
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByRole('heading', { name: 'Library' })).toBeVisible();
  await expect.element(dialog.getByRole('heading', { name: 'Reader' })).toBeVisible();
  await expect.element(dialog.getByText('Focus the search box')).toBeVisible();
  await expect.element(dialog.getByText('Open the focused book')).toBeVisible();
  await expect.element(dialog.getByText('Show the controls')).toBeVisible();
  await expect.element(dialog.getByText('Hide the controls')).toBeVisible();
  await expect.element(dialog.getByText('Toggle the table of contents')).toBeVisible();

  await userEvent.keyboard('{Escape}');

  await expectClosed(screen);
  await expect.element(tile).toHaveFocus();
});

test('while the shortcuts are open, no other shortcut fires', async () => {
  const screen = await openApp('/');
  await expect.element(screen.getByRole('link', { name: /Jane Eyre/ })).toBeVisible();

  await userEvent.keyboard('?');
  await expect.element(shortcutsDialog(screen)).toBeVisible();
  await userEvent.keyboard('/');

  await expect.element(screen.getByRole('searchbox', { name: 'Search books' })).not.toHaveFocus();
});

test.each(['/', '/books/1'])('the ⋮ menu opens the shortcuts at %s', async (path) => {
  const screen = await openApp(path);
  const more = screen.getByRole('banner').getByRole('button', { name: 'More' });
  await userEvent.click(more);
  const item = screen.getByRole('menuitem', { name: 'Keyboard shortcuts' });
  await expect.element(item).toHaveAttribute('aria-keyshortcuts', 'Shift+/');

  await userEvent.click(item);

  await expect.element(shortcutsDialog(screen)).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await expectClosed(screen);
  await expect.element(more).toHaveFocus();
});

test.each([
  { path: '/books/1', ready: { role: 'link', name: 'Read EPUB' } },
  { path: '/books/1/read/EPUB', ready: { role: 'button', name: 'Next page' } },
] as const)('? opens the shortcuts at $path', async ({ path, ready }) => {
  const screen = await openApp(path);
  await expect.element(screen.getByRole(ready.role, { name: ready.name })).toBeInTheDocument();

  await userEvent.keyboard('?');

  await expect.element(shortcutsDialog(screen)).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await expectClosed(screen);
});

test('? while typing in the search box types a ?', async () => {
  const screen = await openApp('/');
  const box = screen.getByRole('searchbox', { name: 'Search books' });
  await userEvent.click(box);

  await userEvent.keyboard('?');

  await expect.element(box).toHaveValue('?');
  expect(shortcutsDialog(screen).query()).toBeNull();
});

test('the connect screen has no shortcuts', async () => {
  const app = await renderApp({ storage: await janeEyreLibrary() });
  await expect.element(app.screen.getByRole('heading', { level: 1 })).toBeVisible();

  await userEvent.keyboard('?/');

  expect(shortcutsDialog(app.screen).query()).toBeNull();
  expect(document.activeElement).toBe(document.body);
});
