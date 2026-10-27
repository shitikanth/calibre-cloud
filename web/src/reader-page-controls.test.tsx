import { userEvent, type Locator } from 'vitest/browser';
import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const epub = ['# Chapter one', 'line 2', 'line 3', '# Chapter two', 'line 5'].join('\n');
const pdf = ['Page one', 'Page two', 'Page three'].join('\n');

async function janeEyreLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub, PDF: pdf } }]),
  );
}

async function openReader(path: string, storage?: FakeStorage) {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: storage ?? (await janeEyreLibrary()), connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByRole('button', { name: 'Next' })).toBeVisible();
  const bar = app.screen.getByRole('slider', { name: 'Position in book' });
  return { fake, app, bar };
}

test('the bar is a slider showing how far through the book, and it follows page turns', async () => {
  const { app, bar } = await openReader('/books/1/read/EPUB');
  await expect.element(bar).toHaveAttribute('aria-valuetext', '0%');

  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));

  await expect.element(bar).toHaveAttribute('aria-valuetext', '25%');
  await expect.element(bar).toHaveValue('25');
});

test('in a paged book the bar counts pages', async () => {
  const { app, bar } = await openReader('/books/1/read/PDF');
  await expect.element(bar).toHaveAttribute('aria-valuetext', 'Page 1 of 3');

  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));

  await expect.element(bar).toHaveAttribute('aria-valuetext', 'Page 2 of 3');
  await expect.element(bar).toHaveValue('2');
});

function drag(bar: Locator, value: number) {
  const element = bar.element() as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, String(value));
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function release(bar: Locator) {
  bar.element().dispatchEvent(new Event('change', { bubbles: true }));
}

test('dragging previews the chapter it would land in, and jumps only on release', async () => {
  const { fake, app, bar } = await openReader('/books/1/read/EPUB');

  drag(bar, 75);

  await expect.element(app.screen.getByText('Chapter two · 75%')).toBeVisible();
  await expect.element(bar).toHaveAttribute('aria-valuetext', '75%');
  await expect.element(app.screen.getByText('# Chapter one')).toBeVisible();
  expect(fake.latest.calls.filter(({ op }) => op === 'goToFraction')).toEqual([]);

  release(bar);

  await expect.element(app.screen.getByText('# Chapter two')).toBeVisible();
  expect(fake.latest.calls).toContainEqual({ op: 'goToFraction', fraction: 0.75 });
  await expect.element(app.screen.getByText('75%', { exact: true })).toBeVisible();
});

test('dragging in a paged book previews the page number', async () => {
  const { app, bar } = await openReader('/books/1/read/PDF');

  drag(bar, 3);

  await expect.element(app.screen.getByText('page 3 of 3', { exact: true })).toBeVisible();
  await expect.element(app.screen.getByText('Page one')).toBeVisible();
});

test('clicking the bar jumps there, and the jump is saved like a page turn', async () => {
  const { fake, app, bar } = await openReader('/books/1/read/PDF');
  const { width, height } = bar.element().getBoundingClientRect();

  await userEvent.click(bar, { position: { x: width - 2, y: height / 2 } });

  await expect.element(app.screen.getByText('Page three')).toBeVisible();
  await expect.element(bar).toHaveAttribute('aria-valuetext', 'Page 3 of 3');
  expect(fake.latest.calls).toContainEqual({ op: 'goToFraction', fraction: 1 });

  const reloaded = await app.reload();
  await expect.element(reloaded.getByText('Page three')).toBeVisible();
  expect(fake.latest.opened?.location).toBe('3');
});
