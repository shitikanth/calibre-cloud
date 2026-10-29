import { afterEach, expect, test, vi } from 'vitest';
import type { Relocation, SearchResult } from '../renderer.ts';
import { swipe } from '../../test/swipe.ts';
import { createFoliateRenderer, type FoliateRenderer } from './renderer.ts';
import fixtureUrl from '../../test/fixtures/two-chapters.epub?url';
import azw3Url from '../../test/fixtures/two-chapters.azw3?url';
import fb2Url from '../../test/fixtures/two-chapters.fb2?url';
import fbzUrl from '../../test/fixtures/two-chapters.fbz?url';
import mobiUrl from '../../test/fixtures/two-chapters.mobi?url';
import cbzUrl from '../../test/fixtures/two-pages.cbz?url';
import fixedLayoutEpubUrl from '../../test/fixtures/two-fixed-pages.epub?url';

type OpenedBook = { renderer: FoliateRenderer; relocations: Relocation[]; container: HTMLElement };

const opened: OpenedBook[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const book of opened.splice(0)) await close(book);
});

function nextFrame() {
  return new Promise(requestAnimationFrame);
}

async function close({ renderer, container }: OpenedBook) {
  await nextFrame();
  renderer.destroy();
  container.remove();
}

type Fixture = { extension: string; url: string };

const epubFixture: Fixture = { extension: 'epub', url: fixtureUrl };

async function createInContainer(extension = 'epub'): Promise<OpenedBook> {
  const container = document.createElement('div');
  container.style.cssText = 'width: 600px; height: 800px';
  document.body.append(container);
  const renderer = await createFoliateRenderer(extension);
  const relocations: Relocation[] = [];
  renderer.onRelocate((relocation) => relocations.push(relocation));
  const book = { renderer, relocations, container };
  opened.push(book);
  return book;
}

async function openFixture(location?: string, { extension, url }: Fixture = epubFixture): Promise<OpenedBook> {
  const book = await createInContainer(extension);
  const blob = await (await fetch(url)).blob();
  await book.renderer.open(blob, book.container, location === undefined ? {} : { location });
  await vi.waitFor(() => expect(book.relocations.length).toBeGreaterThan(0));
  await nextFrame();
  return book;
}

async function settled(relocations: Relocation[]) {
  let count: number;
  do {
    count = relocations.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (count !== relocations.length);
}

function goToChapterTwo(renderer: FoliateRenderer) {
  return renderer.goTo(renderer.toc[1]?.location ?? '');
}

function computed(doc: Document | undefined, selector: 'html' | 'body') {
  const element = selector === 'html' ? doc?.documentElement : doc?.body;
  return element && doc?.defaultView?.getComputedStyle(element);
}

test('opens the fixture and reports the start of the visible range with a fraction', async () => {
  const { relocations } = await openFixture();

  expect(relocations[0]?.location).toMatch(/^epubcfi\(.+\)$/);
  expect(relocations[0]?.location).not.toContain(',');
  expect(relocations[0]?.fraction).toBeGreaterThanOrEqual(0);
  expect(relocations[0]?.fraction).toBeLessThanOrEqual(1);
});

test('exposes the TOC, and goTo on a TOC entry lands in chapter two', async () => {
  const { renderer, relocations } = await openFixture();

  expect(renderer.toc).toEqual([
    { label: 'One: The Lighthouse Ledger', location: 'OEBPS/text/chapter-one.xhtml' },
    { label: 'Two: The Unsent Letters', location: 'OEBPS/text/chapter-two.xhtml' },
  ]);
  const opening = relocations[0]?.fraction ?? Number.NaN;

  expect(relocations[0]?.tocEntry).toBe(renderer.toc[0]);

  await goToChapterTwo(renderer);

  expect(renderer.sectionDocument?.getElementById('chapter-two')?.textContent).toBe('Two: The Unsent Letters');
  expect(relocations.at(-1)?.fraction).toBeGreaterThan(opening);
  expect(relocations.at(-1)?.tocEntry).toBe(renderer.toc[1]);
});

test('setStyles applies the font size as a percentage and the theme colours to the section document', async () => {
  const { renderer } = await openFixture();
  const base = parseFloat(computed(renderer.sectionDocument, 'html')?.fontSize ?? '0');
  expect(base).toBeGreaterThan(0);

  renderer.setStyles?.({ fontSize: 150, theme: 'dark' });

  await vi.waitFor(() => {
    expect(parseFloat(computed(renderer.sectionDocument, 'html')?.fontSize ?? '0')).toBe(base * 1.5);
    expect(computed(renderer.sectionDocument, 'body')?.backgroundColor).toBe('rgb(18, 18, 18)');
    expect(computed(renderer.sectionDocument, 'body')?.color).toBe('rgb(224, 224, 224)');
  });
});

test('opens at a saved CFI, and at the start when the location does not resolve', async () => {
  const first = await openFixture();
  await goToChapterTwo(first.renderer);
  const saved = first.relocations.at(-1)?.location ?? '';
  await close(first);

  const resumed = await openFixture(saved);
  expect(resumed.renderer.sectionDocument?.getElementById('chapter-two')).not.toBeNull();
  expect(resumed.relocations[0]?.location).toBe(saved);
  await close(resumed);

  for (const location of ['epubcfi(/6/99!/4/2/1:0)', 'not-a-location']) {
    const fallback = await openFixture(location);
    expect(fallback.renderer.sectionDocument?.getElementById('chapter-one')).not.toBeNull();
    await close(fallback);
  }
});

test('a location that cannot be shown is reported through onRenderError and navigation keeps working', async () => {
  const { renderer } = await openFixture();
  const errors: Error[] = [];
  renderer.onRenderError((error) => errors.push(error));

  await renderer.goTo('OEBPS/text/missing.xhtml');

  expect(errors.map((error) => error.message)).toEqual(['Could not go to OEBPS/text/missing.xhtml']);
  await goToChapterTwo(renderer);
  expect(renderer.sectionDocument?.getElementById('chapter-two')).not.toBeNull();
});

test('a tap on a link out of the book reports its URL and opens nothing, while a link within the book still navigates', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const { renderer } = await openFixture();
  const reported: string[] = [];
  renderer.onExternalLink((url) => reported.push(url));
  const [service, inspector, smudged, torn, letters] = renderer.sectionDocument?.getElementById('links')?.querySelectorAll('a') ?? [];

  for (const link of [service, inspector, smudged, torn]) link?.click();

  await vi.waitFor(() =>
    expect(reported).toEqual([
      'https://example.com/lighthouse-service',
      'mailto:inspector@example.com',
      `javascript:document.body.insertAdjacentHTML('beforeend','<p id="ran-link"></p>')`,
      'data:text/html,%3Cp%3Ecard%3C/p%3E',
    ]),
  );
  await nextFrame();
  expect(open).not.toHaveBeenCalled();
  expect(renderer.sectionDocument?.getElementById('ran-link')).toBeNull();

  letters?.click();

  await vi.waitFor(() => expect(renderer.sectionDocument?.getElementById('chapter-two')).not.toBeNull());
  expect(reported).toHaveLength(4);
  expect(open).not.toHaveBeenCalled();
});

test('open rejects when the file is not a book', async () => {
  const { renderer, container } = await createInContainer();

  await expect(renderer.open(new Blob(['not a book']), container, {})).rejects.toThrow();
});

test('key presses and pointer presses inside the section document reach the page around the book, which decides what they do', async () => {
  const { renderer, relocations, container } = await openFixture();
  const reached: string[] = [];
  for (const type of ['keydown', 'pointerdown']) {
    container.parentElement?.addEventListener(type, (event) => reached.push(`${type} ${(event as KeyboardEvent).key ?? ''}`.trim()));
  }
  const doc = renderer.sectionDocument;
  await settled(relocations);
  const before = relocations.length;

  doc?.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  doc?.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  doc?.querySelector('p')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

  expect(reached).toEqual(['keydown ArrowRight', 'keydown Escape', 'pointerdown']);
  await settled(relocations);
  expect(relocations).toHaveLength(before);
});

test('a click on the page outside the section document, such as its margin, is reported as a tap', async () => {
  const { renderer, container } = await openFixture();
  const taps: number[] = [];
  renderer.onTap(({ x }) => taps.push(x));

  container.querySelector('foliate-view')?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: 300 }));

  expect(taps).toEqual([300]);
});


test('destroy during open leaves nothing behind', async () => {
  const { renderer, relocations, container } = await createInContainer();
  const blob = await (await fetch(fixtureUrl)).blob();

  const opening = renderer.open(blob, container, {});
  renderer.destroy();
  await opening;
  await settled(relocations);

  expect(container.childElementCount).toBe(0);
  expect(renderer.toc).toEqual([]);
  expect(renderer.sectionDocument).toBeUndefined();
  expect(relocations).toEqual([]);
});

const mobiFamily: Fixture[] = [
  { extension: 'mobi', url: mobiUrl },
  { extension: 'azw3', url: azw3Url },
];

const reflowable: Fixture[] = [
  ...mobiFamily,
  { extension: 'fb2', url: fb2Url },
  { extension: 'fbz', url: fbzUrl },
];

test.each(reflowable)('$extension: TOC goes to chapter two, text settings apply, and its CFI reopens there', async (fixture) => {
  const first = await openFixture(undefined, fixture);
  expect(first.renderer.toc.map((entry) => entry.label)).toEqual(['One: The Lighthouse Ledger', 'Two: The Unsent Letters']);
  expect(first.relocations[0]?.location).toMatch(/^epubcfi\(.+\)$/);
  expect(first.renderer.sectionDocument?.body.textContent).toContain('ledger bound in sailcloth');

  await goToChapterTwo(first.renderer);
  await settled(first.relocations);
  expect(first.renderer.sectionDocument?.body.textContent).toContain('tin box of letters');
  expect(first.relocations.at(-1)?.tocEntry).toBe(first.renderer.toc[1]);
  first.renderer.setStyles?.({ fontSize: 100, theme: 'dark' });
  await vi.waitFor(() => expect(computed(first.renderer.sectionDocument, 'body')?.backgroundColor).toBe('rgb(18, 18, 18)'));
  const saved = first.relocations.at(-1)?.location ?? '';
  await close(first);

  const resumed = await openFixture(saved, fixture);
  expect(resumed.relocations[0]?.location).toBe(saved);
  expect(resumed.renderer.sectionDocument?.body.textContent).toContain('tin box of letters');
});

test.each([epubFixture, ...reflowable])('$extension: goToFraction jumps into chapter two, and tocEntryAt names the chapter without moving', async (fixture) => {
  const { renderer, relocations } = await openFixture(undefined, fixture);
  await goToChapterTwo(renderer);
  await settled(relocations);
  const chapterTwo = relocations.at(-1)?.fraction ?? Number.NaN;
  await renderer.goTo(renderer.toc[0]?.location ?? '');
  await settled(relocations);
  const before = relocations.length;

  expect(renderer.tocEntryAt(0)).toBe(renderer.toc[0]);
  expect(renderer.tocEntryAt(chapterTwo)).toBe(renderer.toc[1]);
  expect(relocations).toHaveLength(before);

  await renderer.goToFraction(chapterTwo);
  await settled(relocations);

  expect(relocations.at(-1)?.tocEntry).toBe(renderer.toc[1]);
});

const scripted = [
  { ...epubFixture, chapterTwo: 'The first letter was addressed', refused: ['application/javascript'] },
  ...mobiFamily.map((fixture) => ({ ...fixture, chapterTwo: 'tin box of letters', refused: [] })),
];

test.each(scripted)("$extension: chapter two's scripts never run: scripts, handlers and script resources are removed and no marker appears", async ({ chapterTwo, refused, ...fixture }) => {
  const { renderer, relocations } = await openFixture(undefined, fixture);

  await goToChapterTwo(renderer);
  await settled(relocations);
  const doc = renderer.sectionDocument;
  doc?.querySelector('h1')?.click();
  await nextFrame();

  expect(doc?.body.textContent).toContain(chapterTwo);
  expect(doc?.querySelector('script')).toBeNull();
  expect([...(doc?.querySelectorAll('*') ?? [])].flatMap((element) => element.getAttributeNames().filter((name) => /^on/i.test(name)))).toEqual([]);
  for (const marker of ['ran-inline', 'ran-handler', 'ran-external']) expect(doc?.getElementById(marker)).toBeNull();
  expect(renderer.refusedResources).toEqual(refused);
});

const fixedLayout = [
  { extension: 'cbz', url: cbzUrl, toc: ['page-1.png', 'page-2.png'] },
  { extension: 'epub', url: fixedLayoutEpubUrl, toc: ['Page one', 'Page two'] },
];

test.each(fixedLayout)('fixed-layout $extension: pages open without text settings, turn, and the CFI reopens on the same page', async ({ toc, ...fixture }) => {
  const first = await openFixture(undefined, fixture);
  expect(first.renderer.setStyles).toBeUndefined();
  expect(first.renderer.toc.map((entry) => entry.label)).toEqual(toc);
  expect(first.relocations[0]?.location).toMatch(/^epubcfi\(.+\)$/);
  const opening = first.relocations[0]?.location;

  await first.renderer.next();
  await settled(first.relocations);
  const saved = first.relocations.at(-1)?.location ?? '';
  expect(saved).not.toBe(opening);
  await close(first);

  const resumed = await openFixture(saved, fixture);
  expect(resumed.relocations[0]?.location).toBe(saved);
});

test.each(fixedLayout)('fixed-layout $extension: goToFraction jumps to the last page and tocEntryAt names it', async ({ toc, ...fixture }) => {
  const { renderer, relocations } = await openFixture(undefined, fixture);

  expect(renderer.tocEntryAt(1)?.label).toBe(toc[1]);

  await renderer.goToFraction(1);
  await settled(relocations);

  expect(relocations.at(-1)?.tocEntry?.label).toBe(toc[1]);
});

test('a swipe inside the section document turns the page and is reported as a turn', async () => {
  const { renderer, relocations } = await openFixture();
  const opening = relocations.at(-1)?.fraction ?? Number.NaN;
  let turns = 0;
  renderer.onTurn(() => (turns += 1));

  await swipe(renderer.sectionDocument?.body as Element, 500, 100);

  await vi.waitFor(() => expect(relocations.at(-1)?.fraction).toBeGreaterThan(opening));
  expect(turns).toBe(1);
});

test('a swipe inside the section document while the browser is pinch-zoomed neither turns the page nor is reported as a turn', async () => {
  const { renderer, relocations } = await openFixture();
  const opening = relocations.at(-1)?.fraction;
  let turns = 0;
  renderer.onTurn(() => (turns += 1));
  vi.spyOn(VisualViewport.prototype, 'scale', 'get').mockReturnValue(2);

  await swipe(renderer.sectionDocument?.body as Element, 500, 100);

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(relocations.at(-1)?.fraction).toBe(opening);
  expect(turns).toBe(0);
});

function frameOf(doc: Document | undefined) {
  return doc?.defaultView?.frameElement as HTMLElement;
}

function clickAt(element: Element | null | undefined, x: number) {
  const frame = frameOf(element?.ownerDocument);
  const { left, width } = frame.getBoundingClientRect();
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: (x - left) / (width / frame.offsetWidth) }));
}

test('a tap on the page is reported with where it landed across the screen, but not a tap on a link or one that ends a text selection', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  const { renderer } = await openFixture();
  const taps: number[] = [];
  renderer.onTap(({ x }) => taps.push(x));
  const doc = renderer.sectionDocument;
  const paragraph = doc?.querySelector('p');

  clickAt(paragraph, 50);
  clickAt(paragraph, 550);
  expect(taps).toEqual([50, 550]);

  clickAt(doc?.getElementById('links')?.querySelector('a'), 50);
  if (paragraph) doc?.getSelection()?.selectAllChildren(paragraph);
  clickAt(paragraph, 50);
  expect(taps).toEqual([50, 550]);
});

async function searchAll(renderer: FoliateRenderer, query: string, signal = new AbortController().signal) {
  const search = renderer.search;
  if (!search) throw new Error('No search');
  const results: SearchResult[] = [];
  for await (const result of search.find(query, signal)) results.push(result);
  return results;
}

test('search finds every match in book order, ignoring case and diacritics, under its chapter with an excerpt and a fraction', async () => {
  const { renderer } = await openFixture();

  const results = await searchAll(renderer, 'MÁRIT');

  expect(results.map(({ excerpt }) => excerpt.match)).toEqual(['Marit', 'Marit', 'Marit', 'Marit', 'Marit']);
  expect(results.map(({ tocEntry }) => tocEntry)).toEqual([...Array(3).fill(renderer.toc[0]), ...Array(2).fill(renderer.toc[1])]);
  expect(results[0]?.excerpt).toEqual({ before: '', match: 'Marit', after: expect.stringMatching(/^ Halvorsen kept the ledger/) });
  const fractions = results.map(({ fraction }) => fraction);
  expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  expect(new Set(fractions).size).toBe(5);
  const chapterTwo = renderer.tocEntryAt(fractions[3] ?? 0);
  expect(chapterTwo).toBe(renderer.toc[1]);
  expect(renderer.tocEntryAt(fractions[2] ?? 0)).toBe(renderer.toc[0]);

  await renderer.goTo(results[3]?.location ?? '');

  expect(renderer.sectionDocument?.getElementById('chapter-two')).not.toBeNull();
});

test('search stops once its signal aborts', async () => {
  const { renderer } = await openFixture();
  const controller = new AbortController();
  const results: SearchResult[] = [];

  for await (const result of renderer.search?.find('Marit', controller.signal) ?? []) {
    results.push(result);
    controller.abort();
  }

  expect(results).toHaveLength(1);
});

function highlightsIn(renderer: FoliateRenderer) {
  return Array.from(renderer.overlay?.querySelectorAll<SVGGElement>('g[data-highlight]') ?? [], (group) => ({
    kind: group.dataset.highlight,
    rects: group.querySelectorAll('rect').length,
  }));
}

test('highlight marks the picked match and, fainter, the other matches in its chapter, until cleared', async () => {
  const { renderer } = await openFixture();
  const results = await searchAll(renderer, 'pear tree');
  expect(results).toHaveLength(2);
  const [picked, other] = results;
  if (!picked || !other) throw new Error('Expected two results');
  const elsewhere = (await searchAll(renderer, 'lighthouse'))[0];
  if (!elsewhere) throw new Error('Expected a match in chapter one');

  await renderer.goTo(picked.location);
  renderer.search?.highlight(picked, [elsewhere, picked, other]);

  await vi.waitFor(() =>
    expect(highlightsIn(renderer)).toEqual([
      { kind: 'other', rects: expect.any(Number) },
      { kind: 'picked', rects: expect.any(Number) },
    ]),
  );
  expect(highlightsIn(renderer).every(({ rects }) => rects > 0)).toBe(true);

  renderer.search?.clearHighlights();

  expect(highlightsIn(renderer)).toEqual([]);
});

test('a comic book has nothing to search', async () => {
  const { renderer } = await openFixture(undefined, { extension: 'cbz', url: cbzUrl });

  expect(renderer.search).toBeUndefined();
});

test.each(fixedLayout)('fixed-layout $extension: a tap on a scaled page is reported where it landed across the screen', async (fixture) => {
  const { renderer } = await openFixture(undefined, fixture);
  const taps: number[] = [];
  renderer.onTap(({ x }) => taps.push(x));
  const page = renderer.sectionDocument?.body;
  const { left, width } = frameOf(page?.ownerDocument).getBoundingClientRect();

  clickAt(page, left + width / 4);

  expect(taps).toHaveLength(1);
  expect(taps[0]).toBeCloseTo(left + width / 4, 0);
});
