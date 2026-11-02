import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { expectControls, showControls } from './test/reader.ts';
import { renderApp } from './test/render-app.tsx';

const epub = ['# Chapter one', 'line 2', 'line 3', '# Chapter two', 'line 5'].join('\n');
const pdf = ['Page one', 'Page two', 'Page three'].join('\n');

afterEach(async () => {
  await page.viewport(414, 896);
});

async function openReader(path = '/books/1/read/EPUB') {
  const storage = new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub, PDF: pdf } }]),
  );
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter one').or(app.screen.getByText('Page one'))).toBeVisible();
  return { fake, screen: app.screen };
}

test('Space and Page Down turn to the next page, Shift+Space and Page Up to the previous', async () => {
  const { screen } = await openReader();

  await userEvent.keyboard(' ');
  await expect.element(screen.getByText('line 2')).toBeVisible();
  await userEvent.keyboard('{PageDown}');
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await userEvent.keyboard('{Shift>} {/Shift}');
  await expect.element(screen.getByText('line 2')).toBeVisible();
  await userEvent.keyboard('{PageUp}');
  await expect.element(screen.getByText('# Chapter one')).toBeVisible();
});

test('the page-turn zones declare their keys', async () => {
  const { screen } = await openReader();

  await expect.element(screen.getByRole('button', { name: 'Next page' })).toHaveAttribute('aria-keyshortcuts', 'ArrowRight Space PageDown');
  await expect.element(screen.getByRole('button', { name: 'Previous page' })).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft Shift+Space PageUp');
});

test('Space on a focused control presses the control and does not turn the page', async () => {
  const { fake, screen } = await openReader();
  await showControls(screen);
  const toc = screen.getByRole('button', { name: 'Table of contents' });
  (toc.element() as HTMLElement).focus();

  await userEvent.keyboard(' ');

  await expect.element(screen.getByRole('navigation', { name: 'Table of contents' })).toBeVisible();
  expect(fake.latest.calls.filter(({ op }) => op === 'next')).toEqual([]);
});

test('with Control, Meta or Alt held, Space and the page keys are left to the browser', async () => {
  const { fake } = await openReader();

  await userEvent.keyboard('{Control>} {PageDown}{/Control}{Meta>} {/Meta}{Alt>}{PageDown}{/Alt}');

  expect(fake.latest.calls.filter(({ op }) => op === 'next')).toEqual([]);
});

test('while the shortcuts are open, the reader keys do nothing', async () => {
  const { fake, screen } = await openReader();

  await userEvent.keyboard('?');
  await expect.element(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await userEvent.keyboard('{ArrowRight}{PageDown}');

  await expect.element(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  expect(fake.latest.calls.filter(({ op }) => op === 'next')).toEqual([]);
  await expectControls(screen, false);
});
