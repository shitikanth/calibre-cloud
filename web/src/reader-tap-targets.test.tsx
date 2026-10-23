import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';
import type { Screen } from './test/screen.ts';

const epub = ['# Chapter one', 'some text', '# Chapter two', 'more text'].join('\n');
const epubPath = 'Charlotte Bronte/Jane Eyre (1)/Jane Eyre - Charlotte Bronte.epub';

afterEach(async () => {
  await page.viewport(414, 896);
});

async function janeEyreLibrary() {
  return new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub } }]));
}

function size(screen: Screen, role: 'button' | 'link', name: string) {
  const { width, height } = screen.getByRole(role, { name }).element().getBoundingClientRect();
  return { width, height };
}

test('on a phone, the reader’s buttons and links are at least 44 px tall', async () => {
  await page.viewport(390, 844);
  const storage = await janeEyreLibrary();
  const held = storage.holdNextRead(epubPath);
  const fake = fakeRenderers(['EPUB']);
  const app = await renderApp({ storage, connected: true, path: '/books/1', renderers: fake.renderers });
  await expect.element(app.screen.getByRole('link', { name: 'Read EPUB' })).toBeVisible();
  expect(size(app.screen, 'link', 'Read EPUB').height).toBeGreaterThanOrEqual(44);
  expect(size(app.screen, 'button', 'Download EPUB').height).toBeGreaterThanOrEqual(44);

  await userEvent.click(app.screen.getByRole('link', { name: 'Read EPUB' }));
  await held.started;
  await expect.element(app.screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
  expect(size(app.screen, 'button', 'Cancel').height).toBeGreaterThanOrEqual(44);
  held.release();

  await expect.element(app.screen.getByText('# Chapter one')).toBeVisible();
  for (const name of ['Previous', 'Next']) expect(size(app.screen, 'button', name).height).toBeGreaterThanOrEqual(44);
  for (const name of ['Table of contents', 'Settings']) {
    const { width, height } = size(app.screen, 'button', name);
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  }
  const back = size(app.screen, 'link', 'Back to book');
  expect(back.width).toBeGreaterThanOrEqual(44);
  expect(back.height).toBeGreaterThanOrEqual(44);

  await userEvent.click(app.screen.getByRole('button', { name: 'Table of contents' }));
  const toc = app.screen.getByRole('navigation', { name: 'Table of contents' });
  await expect.element(toc).toBeVisible();
  expect(toc.getByRole('button', { name: 'Chapter one' }).element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});
