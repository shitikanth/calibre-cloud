import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const epub = ['# Chapter one', 'some text', '# Chapter two', 'more text'].join('\n');

async function janeEyreLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub, PDF: 'Page one\nPage two' } },
    ]),
  );
}

async function openReader(path: string) {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: await janeEyreLibrary(), connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByRole('button', { name: 'Table of contents' })).toBeVisible();
  return { fake, app };
}

test('the table of contents lists the chapters and jumps to the one tapped', async () => {
  const { fake, app } = await openReader('/books/1/read/EPUB');
  await expect.element(app.screen.getByText('# Chapter one')).toBeVisible();

  await userEvent.click(app.screen.getByRole('button', { name: 'Table of contents' }));
  const toc = app.screen.getByRole('navigation', { name: 'Table of contents' });
  await expect.element(toc).toBeVisible();
  expect(toc.getByRole('button').elements().map((entry) => entry.textContent)).toEqual(['Chapter one', 'Chapter two']);

  await userEvent.click(toc.getByRole('button', { name: 'Chapter two' }));

  await expect.element(app.screen.getByText('# Chapter two')).toBeVisible();
  expect(app.screen.getByRole('navigation', { name: 'Table of contents' }).query()).toBeNull();
  expect(fake.latest.calls).toContainEqual({ op: 'goTo', location: '3' });
});

test('a book without a table of contents says so, and Escape closes the list', async () => {
  const { app } = await openReader('/books/1/read/PDF');

  await userEvent.click(app.screen.getByRole('button', { name: 'Table of contents' }));
  await expect.element(app.screen.getByRole('navigation', { name: 'Table of contents' })).toMatchTextContent(/No table of contents/);

  await userEvent.keyboard('{Escape}');
  expect(app.screen.getByRole('navigation', { name: 'Table of contents' }).query()).toBeNull();
});

test('nested entries are listed under their parent, and a tap outside closes the list', async () => {
  const { fake, app } = await openReader('/books/1/read/EPUB');
  fake.latest.toc = [
    { label: 'Part one', location: '1', children: [{ label: 'Chapter one', location: '1' }, { label: 'Chapter two', location: '3' }] },
    { label: 'Part two', location: '4' },
  ];

  await userEvent.click(app.screen.getByRole('button', { name: 'Table of contents' }));
  const toc = app.screen.getByRole('navigation', { name: 'Table of contents' });
  expect(toc.getByRole('button').elements().map((entry) => entry.textContent)).toEqual([
    'Part one',
    'Chapter one',
    'Chapter two',
    'Part two',
  ]);
  const nested = toc.getByRole('button', { name: 'Chapter two' }).element();
  expect(nested.closest('li')?.parentElement?.closest('li')?.querySelector('button')?.textContent).toBe('Part one');

  await userEvent.click(app.screen.getByRole('heading', { level: 1, name: 'Jane Eyre' }));
  expect(app.screen.getByRole('navigation', { name: 'Table of contents' }).query()).toBeNull();
  expect(fake.latest.calls.filter(({ op }) => op === 'goTo')).toEqual([]);
});
