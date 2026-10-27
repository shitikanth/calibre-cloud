import { userEvent, type Locator } from 'vitest/browser';
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
  await expect.poll(() => app.screen.getByRole('navigation', { name: 'Table of contents' }).query()).toBeNull();
  expect(fake.latest.calls).toContainEqual({ op: 'goTo', location: '3' });
});

test('a book without a table of contents says so, and Escape closes the list', async () => {
  const { app } = await openReader('/books/1/read/PDF');

  await userEvent.click(app.screen.getByRole('button', { name: 'Table of contents' }));
  await expect.element(app.screen.getByRole('navigation', { name: 'Table of contents' })).toMatchTextContent(/No table of contents/);

  await userEvent.keyboard('{Escape}');
  await expect.poll(() => app.screen.getByRole('navigation', { name: 'Table of contents' }).query()).toBeNull();
});

test('nested entries are listed under their parent, and a tap outside closes the list', async () => {
  const { fake, app } = await openReader('/books/1/read/EPUB');
  fake.latest.toc = [
    { label: 'Part one', location: '1', children: [{ label: 'Chapter one', location: '1' }, { label: 'Chapter two', location: '3' }] },
    { label: 'Part two', location: '4' },
  ];

  await userEvent.click(app.screen.getByRole('button', { name: 'Table of contents' }));
  const toc = app.screen.getByRole('navigation', { name: 'Table of contents' });
  await expect.element(toc).toBeVisible();
  expect(toc.getByRole('button').elements().map((entry) => entry.textContent)).toEqual([
    'Part one',
    'Chapter one',
    'Chapter two',
    'Part two',
  ]);
  const nested = toc.getByRole('list').getByRole('list').getByRole('button');
  expect(nested.elements().map((entry) => entry.textContent)).toEqual(['Chapter one', 'Chapter two']);

  await userEvent.click(app.screen.getByRole('heading', { level: 1, name: 'Jane Eyre' }));
  await expect.poll(() => app.screen.getByRole('navigation', { name: 'Table of contents' }).query()).toBeNull();
  expect(fake.latest.calls.filter(({ op }) => op === 'goTo')).toEqual([]);
});

function currentEntries(toc: Locator) {
  return toc
    .getByRole('button')
    .elements()
    .filter((entry) => entry.getAttribute('aria-current') === 'true')
    .map((entry) => entry.textContent);
}

async function openToc(app: Awaited<ReturnType<typeof openReader>>['app']) {
  await userEvent.click(app.screen.getByRole('button', { name: 'Table of contents' }));
  const toc = app.screen.getByRole('navigation', { name: 'Table of contents' });
  await expect.element(toc).toBeVisible();
  return toc;
}

test('the open list marks the current chapter, and the mark follows page turns', async () => {
  const { fake, app } = await openReader('/books/1/read/EPUB');
  await expect.element(app.screen.getByText('# Chapter one')).toBeVisible();

  const toc = await openToc(app);
  expect(currentEntries(toc)).toEqual(['Chapter one']);

  await fake.latest.next();
  await expect.element(app.screen.getByText('some text')).toBeVisible();
  expect(currentEntries(toc)).toEqual(['Chapter one']);

  await fake.latest.next();
  await expect.poll(() => currentEntries(toc)).toEqual(['Chapter two']);
});

test('a long list opens scrolled to the current chapter', async () => {
  const chapters = Array.from({ length: 60 }, (_, index) => `# Chapter ${index + 1}`).join('\n');
  const storage = new FakeStorage(await buildCalibreLibrary([{ title: 'Long Book', authors: ['Anon'], formats: { EPUB: chapters } }]));
  const fake = fakeRenderers(['EPUB']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter 1', { exact: true })).toBeVisible();
  await fake.latest.goTo('50');
  await expect.element(app.screen.getByText('# Chapter 50')).toBeVisible();

  const toc = await openToc(app);

  expect(currentEntries(toc)).toEqual(['Chapter 50']);
  await expect.element(toc.getByRole('button', { name: 'Chapter 50', exact: true })).toBeInViewport({ ratio: 1 });
  await expect.element(toc.getByRole('button', { name: 'Chapter 1', exact: true })).not.toBeInViewport();
});

test('a nested entry can be current without marking its parent, and nothing is marked before the first entry', async () => {
  const { fake, app } = await openReader('/books/1/read/EPUB');
  await expect.element(app.screen.getByText('# Chapter one')).toBeVisible();
  fake.latest.toc = [
    { label: 'Part one', location: '1', children: [{ label: 'Chapter one', location: '1' }, { label: 'Chapter two', location: '3' }] },
    { label: 'Part two', location: '4' },
  ];
  await fake.latest.goTo('3');

  const toc = await openToc(app);
  expect(currentEntries(toc)).toEqual(['Chapter two']);

  await fake.latest.goTo('1');
  await expect.poll(() => currentEntries(toc)).toEqual(['Chapter one']);

  fake.latest.toc = [{ label: 'Part two', location: '4' }];
  await fake.latest.goTo('2');
  await userEvent.keyboard('{Escape}');
  expect(currentEntries(await openToc(app))).toEqual([]);
});
