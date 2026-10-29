import { page, type Locator } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { showControls } from './test/reader.ts';
import { renderApp } from './test/render-app.tsx';

const epub = ['# Chapter one', 'line 2', 'line 3', '# Chapter two', 'line 5'].join('\n');
const pdf = ['Page one', 'Page two', 'Page three'].join('\n');

afterEach(async () => {
  await page.viewport(414, 896);
});

async function openReader(path: string) {
  const storage = new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub, PDF: pdf } }]),
  );
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByRole('button', { name: 'Next page' })).toBeVisible();
  await showControls(app.screen);
  return { fake, app, screen: app.screen, bar: app.screen.getByRole('slider', { name: 'Position in book' }) };
}

function seek(bar: Locator, value: number) {
  const element = bar.element() as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, String(value));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

test('a seek offers Back to the % it left from', async () => {
  const { fake, screen, bar } = await openReader('/books/1/read/EPUB');
  await fake.latest.next();
  await expect.element(screen.getByText('line 2')).toBeVisible();

  seek(bar, 100);

  await expect.element(screen.getByText('line 5')).toBeVisible();
  await expect.element(screen.getByRole('contentinfo').getByRole('button', { name: 'Back to 25%' })).toBeVisible();
});

test('in a paged book, a seek offers Back to the page it left from', async () => {
  const { fake, screen, bar } = await openReader('/books/1/read/PDF');
  await fake.latest.next();
  await expect.element(screen.getByText('Page two')).toBeVisible();

  seek(bar, 3);

  await expect.element(screen.getByText('Page three')).toBeVisible();
  await expect.element(screen.getByRole('contentinfo').getByRole('button', { name: 'Back to page 2' })).toBeVisible();
});
