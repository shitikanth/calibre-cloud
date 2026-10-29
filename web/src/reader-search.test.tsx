import { userEvent, type Locator } from 'vitest/browser';
import { expect, test } from 'vitest';
import { createFoliateRenderer, type FoliateRenderer } from './reader/foliate/renderer.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import twoChaptersUrl from './test/fixtures/two-chapters.epub?url';
import { fakeRenderers, type FakeRenderer } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';
import { expectControls, showControls, tapZone } from './test/reader.ts';

const book = ['# Chapter one', 'The whale rose', 'A quiet café', '# Chapter two', 'the WHALE sank', 'nothing here'].join('\n');

async function openReader(path: string, setup?: (renderer: FakeRenderer, format: string) => void) {
  const storage = new FakeStorage(
    await buildCalibreLibrary([{ title: 'Moby-Dick', authors: ['Herman Melville'], formats: { EPUB: book, PDF: book, CBZ: book } }]),
  );
  const fake = fakeRenderers(['EPUB', 'PDF', 'CBZ'], setup);
  const app = await renderApp({ storage, connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter one')).toBeVisible();
  return { fake, app, screen: app.screen };
}

type Screen = Awaited<ReturnType<typeof openReader>>['screen'];

async function openSearch(screen: Screen) {
  await showControls(screen);
  await userEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
  const panel = screen.getByRole('search', { name: 'Search in book' });
  await expect.element(panel).toBeVisible();
  return panel;
}

function field(panel: Locator) {
  return panel.getByRole('searchbox', { name: 'Search in book' });
}

function results(panel: Locator) {
  return panel.getByRole('list').getByRole('button');
}

function resultTexts(panel: Locator) {
  return results(panel)
    .elements()
    .map((result) => result.textContent);
}

test('searching lists every match under its chapter, with the match in bold and its percentage', async () => {
  const { screen } = await openReader('/books/1/read/EPUB');

  const panel = await openSearch(screen);
  await expect.element(field(panel)).toHaveFocus();
  await userEvent.fill(field(panel), 'whale');

  await expect.element(panel.getByRole('status')).toHaveTextContent('2 matches');
  expect(panel.getByRole('heading').elements().map((heading) => heading.textContent)).toEqual(['Chapter one', 'Chapter two']);
  expect(resultTexts(panel)).toEqual(['The whale rose20%', 'the WHALE sank80%']);
  expect(results(panel).elements().map((result) => result.querySelector('strong')?.textContent)).toEqual(['whale', 'WHALE']);
});

async function searchFor(screen: Screen, query: string, count: string) {
  const panel = await openSearch(screen);
  await userEvent.fill(field(panel), query);
  await expect.poll(() => panel.getByRole('status').element().textContent).toBe(count);
  return panel;
}

async function pickSecondWhale(screen: Screen, fake: FakeRenderer) {
  const panel = await searchFor(screen, 'whale', '2 matches');
  await userEvent.click(results(panel).nth(1));
  await expect.poll(() => fake.calls.at(-1)?.op).toBe('highlight');
}

function clears(fake: FakeRenderer) {
  return fake.calls.filter(({ op }) => op === 'clearHighlights').length;
}

test('the Search tool sits between Contents and Settings', async () => {
  const { screen } = await openReader('/books/1/read/EPUB');
  await showControls(screen);

  const tools = screen.getByRole('contentinfo').getByRole('button', { name: /^(Table of contents|Search|Settings)$/ });
  expect(tools.elements().map((tool) => tool.getAttribute('aria-label'))).toEqual(['Table of contents', 'Search', 'Settings']);
});

test('picking a result closes the search and the controls, goes to the match, and highlights it among the other matches', async () => {
  const { fake, screen } = await openReader('/books/1/read/EPUB');
  const panel = await searchFor(screen, 'whale', '2 matches');

  await userEvent.click(results(panel).nth(1));

  await expect.element(screen.getByText('the WHALE sank')).toBeVisible();
  await expect.poll(() => screen.getByRole('search').query()).toBeNull();
  await expectControls(screen, false);
  await expect.poll(() => fake.latest.calls.at(-1)).toEqual({ op: 'highlight', location: '5', matches: ['2', '5'] });
  expect(fake.latest.calls).toContainEqual({ op: 'goTo', location: '5' });
});

test.each([
  ['a tap on a page-turn zone', (screen: Screen) => tapZone(screen, 'Next page')],
  ['a tap in the middle of the page', (screen: Screen) => userEvent.click(screen.getByText('the WHALE sank'))],
  ['a swipe', (_screen: Screen, fake: FakeRenderer) => fake.swipe('next')],
  ['an arrow key', () => userEvent.keyboard('{ArrowLeft}')],
])('%s clears the highlights', async (_name, move) => {
  const { fake, screen } = await openReader('/books/1/read/EPUB');
  await pickSecondWhale(screen, fake.latest);
  expect(clears(fake.latest)).toBe(0);

  await move(screen, fake.latest);

  await expect.poll(() => clears(fake.latest)).toBe(1);
});

test('a seek or a table-of-contents jump clears the highlights', async () => {
  const { fake, screen } = await openReader('/books/1/read/EPUB');
  await pickSecondWhale(screen, fake.latest);

  await showControls(screen);
  const bar = screen.getByRole('slider', { name: 'Position in book' }).element() as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(bar, '20');
  bar.dispatchEvent(new Event('change', { bubbles: true }));
  await expect.poll(() => clears(fake.latest)).toBe(1);

  await pickSecondWhale(screen, fake.latest);
  await showControls(screen);
  await userEvent.click(screen.getByRole('button', { name: 'Table of contents' }));
  await userEvent.click(screen.getByRole('navigation', { name: 'Table of contents' }).getByRole('button', { name: 'Chapter one' }));
  await expect.poll(() => clears(fake.latest)).toBe(2);
});

test('reopening Search shows the same term and results with the picked one marked, and clearing the field clears them', async () => {
  const { fake, screen } = await openReader('/books/1/read/EPUB');
  await pickSecondWhale(screen, fake.latest);

  const panel = await openSearch(screen);

  await expect.element(field(panel)).toHaveValue('whale');
  expect(resultTexts(panel)).toEqual(['The whale rose20%', 'the WHALE sank80%']);
  expect(results(panel).elements().map((result) => result.getAttribute('aria-current'))).toEqual([null, 'true']);

  await userEvent.click(panel.getByRole('button', { name: 'Clear search' }));

  await expect.element(field(panel)).toHaveValue('');
  await expect.element(field(panel)).toHaveFocus();
  expect(results(panel).elements()).toEqual([]);
  expect(panel.getByRole('status').element().textContent).toBe('');
});

test('a term with no matches says so', async () => {
  const { screen } = await openReader('/books/1/read/EPUB');

  const panel = await searchFor(screen, 'harpoon', 'No matches');

  expect(results(panel).elements()).toEqual([]);
});

test('a café is found by searching for cafe', async () => {
  const { screen } = await openReader('/books/1/read/EPUB');

  const panel = await searchFor(screen, 'CAFE', '1 match');

  expect(resultTexts(panel)).toEqual(['A quiet café40%']);
});

test('a PDF lists its matches by page number', async () => {
  const { screen } = await openReader('/books/1/read/PDF');

  const panel = await searchFor(screen, 'whale', '2 matches');

  expect(resultTexts(panel)).toEqual(['The whale rosepage 2','the WHALE sankpage 5']);
});

test('a book with no text to search has no Search tool', async () => {
  const { screen } = await openReader('/books/1/read/CBZ', (renderer, format) => {
    if (format === 'CBZ') renderer.search = undefined;
  });
  await showControls(screen);

  await expect.element(screen.getByRole('button', { name: 'Table of contents' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Search', exact: true }).query()).toBeNull();
});

test('changing the term mid-search never shows the old term’s results, even from a search that carries on', async () => {
  const { fake, screen } = await openReader('/books/1/read/EPUB');
  fake.latest.ignoresSearchCancel = true;
  const release = fake.latest.holdSearch();
  const panel = await openSearch(screen);
  await userEvent.fill(field(panel), 'whale');
  await expect.poll(() => fake.latest.searches).toEqual(['whale']);

  await userEvent.fill(field(panel), 'quiet');
  release();

  await expect.poll(() => panel.getByRole('status').element().textContent).toBe('1 match');
  expect(resultTexts(panel)).toEqual(['A quiet café40%']);
  expect(fake.latest.searches).toEqual(['whale', 'quiet']);
});

test('typing a word searches once, for the whole word', async () => {
  const { fake, screen } = await openReader('/books/1/read/EPUB');
  const panel = await openSearch(screen);

  await userEvent.type(field(panel), 'whale');

  await expect.poll(() => panel.getByRole('status').element().textContent).toBe('2 matches');
  expect(fake.latest.searches).toEqual(['whale']);
});

test('closing the reader stops a search in progress', async () => {
  const { fake, screen } = await openReader('/books/1/read/EPUB');
  const searching = fake.latest;
  const release = searching.holdSearch();
  const panel = await openSearch(screen);
  await userEvent.fill(field(panel), 'whale');
  await expect.poll(() => searching.searches).toEqual(['whale']);
  expect(panel.getByRole('status').element().textContent).toBe('Searching…');

  await userEvent.click(screen.getByRole('link', { name: 'Back to book' }));
  await expect.element(screen.getByRole('heading', { level: 1, name: 'Moby-Dick' })).toBeVisible();
  release();

  await expect.poll(() => searching.abandonedSearches).toBe(1);
});

test('with the real EPUB renderer, picking a result shows its chapter with the match highlighted, and a page turn clears it', async () => {
  const files = await buildCalibreLibrary([{ title: 'Two Chapters', authors: ['Calibre Cloud'], formats: { EPUB: '' } }]);
  files['Calibre Cloud/Two Chapters (1)/Two Chapters - Calibre Cloud.epub'] = new Uint8Array(await (await fetch(twoChaptersUrl)).arrayBuffer());
  let renderer: FoliateRenderer | undefined;
  const { screen } = await renderApp({
    storage: new FakeStorage(files),
    connected: true,
    path: '/books/1/read/EPUB',
    renderers: { EPUB: async () => (renderer = await createFoliateRenderer('epub')) },
  });
  await expect.poll(() => renderer?.sectionDocument?.querySelector('p')).toBeTruthy();

  const panel = await searchFor(screen, 'pear tree', '2 matches');
  expect(panel.getByRole('heading').elements().map((heading) => heading.textContent)).toEqual(['Two: The Unsent Letters']);
  await userEvent.click(results(panel).nth(0));

  await expect.poll(() => renderer?.sectionDocument?.getElementById('chapter-two')).toBeTruthy();
  await expect.poll(() => renderer?.overlay?.querySelector('[data-highlight="picked"] rect')).toBeTruthy();

  await tapZone(screen, 'Next page');

  await expect.poll(() => renderer?.overlay?.querySelector('[data-highlight]') ?? null).toBeNull();
});
