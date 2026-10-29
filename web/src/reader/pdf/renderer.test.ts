import { afterEach, expect, test, vi } from 'vitest';
import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fixtureUrl from '../../test/fixtures/two-pages.pdf?url';
import type { BookRenderer, Relocation, SearchResult } from '../renderer.ts';
import { swipe } from '../../test/swipe.ts';
import { createPdfRenderer } from './renderer.ts';

const opened: { renderer: BookRenderer; container: HTMLElement }[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const { renderer, container } of opened.splice(0)) {
    renderer.destroy();
    container.remove();
  }
});

async function openFixture(options: { location?: string } = {}) {
  const blob = await fetch(fixtureUrl).then((response) => response.blob());
  const container = document.createElement('div');
  container.style.cssText = 'width: 600px; height: 800px';
  document.body.append(container);
  const renderer = await createPdfRenderer();
  opened.push({ renderer, container });
  const relocations: Relocation[] = [];
  const errors: Error[] = [];
  renderer.onRelocate((relocation) => relocations.push(relocation));
  renderer.onRenderError((error) => errors.push(error));
  await renderer.open(blob, container, options);
  return { renderer, container, relocations, errors };
}

async function pdfjsPrototypes(): Promise<{ document: PDFDocumentProxy; page: PDFPageProxy }> {
  const data = await fetch(fixtureUrl).then((response) => response.arrayBuffer());
  const loadingTask = getDocument({ data });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  const prototypes = { document: Object.getPrototypeOf(doc) as PDFDocumentProxy, page: Object.getPrototypeOf(page) as PDFPageProxy };
  await loadingTask.destroy();
  return prototypes;
}

function canvasIn(container: HTMLElement): HTMLCanvasElement {
  const canvas = container.querySelector('canvas');
  if (!canvas) throw new Error('No canvas rendered');
  return canvas;
}

test('opens on page 1 of 2 at fit-width and reports it as the first relocation', async () => {
  const { container, relocations } = await openFixture();

  expect(relocations[0]).toEqual({ location: '1', fraction: 0, page: { current: 1, total: 2 }, tocEntry: { label: 'Page one', location: '1' } });
  const canvas = canvasIn(container);
  const viewportWidth = container.firstElementChild?.clientWidth ?? 0;
  expect(viewportWidth).toBeGreaterThan(500);
  expect(canvas.style.width).toBe(`${viewportWidth}px`);
});

test('opens on the saved page when it is in range, and on page 1 otherwise', async () => {
  const saved = await openFixture({ location: '2' });
  expect(saved.relocations[0]?.page).toEqual({ current: 2, total: 2 });

  const stale = await openFixture({ location: '9' });
  expect(stale.relocations[0]?.page).toEqual({ current: 1, total: 2 });
});

test('the outline becomes the TOC with page numbers as locations, and an entry navigates', async () => {
  const { renderer, relocations } = await openFixture();

  expect(renderer.toc).toEqual([
    { label: 'Page one', location: '1' },
    { label: 'Page two', location: '2' },
  ]);

  await renderer.goTo(renderer.toc[1]!.location);

  expect(relocations.at(-1)).toEqual({ location: '2', fraction: 1, page: { current: 2, total: 2 }, tocEntry: { label: 'Page two', location: '2' } });
  expect(relocations.at(-1)?.tocEntry).toBe(renderer.toc[1]);
});

test('goToFraction turns to the nearest page, and tocEntryAt names its entry without turning', async () => {
  const { renderer, relocations } = await openFixture();

  expect(renderer.tocEntryAt(0.7)).toBe(renderer.toc[1]);
  expect(renderer.tocEntryAt(0.3)).toBe(renderer.toc[0]);
  expect(relocations).toHaveLength(1);

  await renderer.goToFraction(0.7);
  expect(relocations.at(-1)?.page).toEqual({ current: 2, total: 2 });

  await renderer.goToFraction(0);
  expect(relocations.at(-1)?.page).toEqual({ current: 1, total: 2 });
});

test('next and previous turn one page at a time and stop at the ends', async () => {
  const { renderer, relocations } = await openFixture();

  await renderer.previous();
  await renderer.next();
  await renderer.next();
  await renderer.previous();

  expect(relocations.map((relocation) => relocation.page?.current)).toEqual([1, 2, 1]);
});

test('a tap on the page is reported with where it landed across the screen', async () => {
  const { renderer, container } = await openFixture();
  const taps: number[] = [];
  renderer.onTap(({ x }) => taps.push(x));

  canvasIn(container).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40 }));

  expect(taps).toEqual([40]);
});

test('a swipe turns the page and is reported as a turn, unless it pans a zoomed page sideways', async () => {
  const { renderer, container, relocations } = await openFixture();
  let turns = 0;
  renderer.onTurn(() => (turns += 1));

  await swipe(canvasIn(container), 500, 100);
  await expect.poll(() => relocations.at(-1)?.page?.current).toBe(2);
  await swipe(canvasIn(container), 100, 500);
  await expect.poll(() => relocations.at(-1)?.page?.current).toBe(1);
  expect(turns).toBe(2);

  renderer.setZoom?.(2);
  await expect.poll(() => relocations.length).toBe(4);
  const scroller = container.firstElementChild as HTMLElement;
  const panning = () => (scroller.scrollLeft += 100);
  scroller.addEventListener('touchmove', panning);
  await swipe(canvasIn(container), 500, 100);
  scroller.removeEventListener('touchmove', panning);

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(relocations.at(-1)?.page?.current).toBe(1);
  expect(turns).toBe(2);
});

test('a swipe while the browser is pinch-zoomed neither turns the page nor is reported as a turn', async () => {
  const { renderer, container, relocations } = await openFixture();
  let turns = 0;
  renderer.onTurn(() => (turns += 1));
  vi.spyOn(VisualViewport.prototype, 'scale', 'get').mockReturnValue(2);

  await swipe(canvasIn(container), 500, 100);

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(relocations.at(-1)?.page?.current).toBe(1);
  expect(turns).toBe(0);
});

test('setZoom scales the page from fit-width and re-renders it', async () => {
  const { renderer, container, relocations } = await openFixture();
  const canvas = canvasIn(container);
  const fitWidth = parseFloat(canvas.style.width);

  renderer.setZoom?.(2);
  await expect.poll(() => parseFloat(canvas.style.width)).toBe(fitWidth * 2);
  expect(relocations.at(-1)?.page).toEqual({ current: 1, total: 2 });

  renderer.setZoom?.(1);
  await expect.poll(() => parseFloat(canvas.style.width)).toBe(fitWidth);
});

test('page 1 is cleaned up once page 2 replaces it', async () => {
  const cleanup = vi.spyOn((await pdfjsPrototypes()).page, 'cleanup');
  const { renderer } = await openFixture();
  expect(cleanup).not.toHaveBeenCalled();

  await renderer.next();

  expect(cleanup.mock.contexts.map((page) => (page as PDFPageProxy).pageNumber)).toEqual([1]);
});

test('a page that fails to load or render is reported as a render error, and paging on from it still works', async () => {
  const { renderer, relocations, errors } = await openFixture();
  const prototypes = await pdfjsPrototypes();

  vi.spyOn(prototypes.document, 'getPage').mockRejectedValueOnce(new Error('Bad page'));
  await renderer.next();
  expect(errors.map((error) => error.message)).toEqual(['Bad page']);
  expect(relocations).toHaveLength(1);
  await renderer.previous();
  expect(relocations.at(-1)?.page).toEqual({ current: 1, total: 2 });

  vi.spyOn(prototypes.page, 'render').mockImplementationOnce(() => {
    throw new Error('Bad render');
  });
  await renderer.next();
  expect(errors.map((error) => error.message)).toEqual(['Bad page', 'Bad render']);
  await renderer.previous();
  expect(relocations.map((relocation) => relocation.page?.current)).toEqual([1, 1, 1]);
});

test('destroy during open leaves nothing behind', async () => {
  const blob = await fetch(fixtureUrl).then((response) => response.blob());
  const container = document.createElement('div');
  document.body.append(container);
  const renderer = await createPdfRenderer();
  opened.push({ renderer, container });

  const opening = renderer.open(blob, container, {});
  renderer.destroy();
  await opening;

  expect(container.childElementCount).toBe(0);
  expect(renderer.toc).toEqual([]);
});

test('destroy empties the container', async () => {
  const { renderer, container } = await openFixture();

  renderer.destroy();

  expect(container.childElementCount).toBe(0);
});

async function searchAll(renderer: BookRenderer, query: string, signal = new AbortController().signal) {
  const results: SearchResult[] = [];
  for await (const result of renderer.search?.find(query, signal) ?? []) results.push(result);
  return results;
}

test('search lists each match by page, ignoring case, under the outline entry for its page', async () => {
  const { renderer } = await openFixture();

  const results = await searchAll(renderer, 'PAGE');

  expect(results.map(({ location, page, fraction, tocEntry }) => ({ location, page, fraction, tocEntry: tocEntry?.label }))).toEqual([
    { location: '1', page: 1, fraction: 0, tocEntry: 'Page one' },
    { location: '1', page: 1, fraction: 0, tocEntry: 'Page one' },
    { location: '2', page: 2, fraction: 1, tocEntry: 'Page two' },
    { location: '2', page: 2, fraction: 1, tocEntry: 'Page two' },
  ]);
  expect(results[1]?.excerpt).toEqual({ before: 'Page one The first ', match: 'page', after: ' of the calibre-cloud PDF…' });
  expect(await searchAll(renderer, 'whale')).toEqual([]);
});

test('search stops once its signal aborts', async () => {
  const { renderer } = await openFixture();
  const controller = new AbortController();
  const results: SearchResult[] = [];

  for await (const result of renderer.search?.find('page', controller.signal) ?? []) {
    results.push(result);
    controller.abort();
  }

  expect(results).toHaveLength(1);
});

function highlightBoxes(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-highlight]'), (box) => ({
    kind: box.dataset.highlight,
    rect: box.getBoundingClientRect(),
  }));
}

test('highlight boxes the picked match and, fainter, the other matches on its page, over the words, until cleared', async () => {
  const { renderer, container } = await openFixture();
  const results = await searchAll(renderer, 'page');
  const [, , heading, body] = results;
  if (!heading || !body) throw new Error('Expected two matches on page 2');

  await renderer.goTo('2');
  renderer.search?.highlight(body, results);

  const boxes = highlightBoxes(container);
  expect(boxes.map(({ kind }) => kind)).toEqual(['other', 'picked']);
  const page = canvasIn(container).getBoundingClientRect();
  const [other, picked] = boxes.map(({ rect }) => rect);
  if (!other || !picked) throw new Error('Expected two boxes');
  for (const box of [other, picked]) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.left).toBeGreaterThanOrEqual(page.left);
    expect(box.right).toBeLessThanOrEqual(page.right);
  }
  expect(other.top).toBeLessThan(picked.top);
  expect(other.height).toBeGreaterThan(picked.height);

  renderer.setZoom?.(2);
  await expect.poll(() => highlightBoxes(container)[1]?.rect.width).toBeCloseTo(picked.width * 2, 0);

  renderer.search?.clearHighlights();

  expect(highlightBoxes(container)).toEqual([]);
});

test('turning to another page drops the highlights', async () => {
  const { renderer, container } = await openFixture();
  const [first] = await searchAll(renderer, 'page');
  if (!first) throw new Error('Expected a match on page 1');
  renderer.search?.highlight(first, [first]);
  expect(highlightBoxes(container)).toHaveLength(1);

  await renderer.next();
  await renderer.previous();

  expect(highlightBoxes(container)).toEqual([]);
});

test('a highlighted match below the fold is scrolled into view', async () => {
  const { renderer, container } = await openFixture();
  container.style.height = '200px';
  renderer.setZoom?.(2);
  await expect.poll(() => canvasIn(container).getBoundingClientRect().height).toBeGreaterThan(1000);
  const [, body] = await searchAll(renderer, 'page');
  if (!body) throw new Error('Expected a second match on page 1');
  const scroller = container.firstElementChild;

  renderer.search?.highlight(body, [body]);

  const box = highlightBoxes(container)[0]?.rect;
  const view = scroller?.getBoundingClientRect();
  expect(box && view && box.top >= view.top && box.bottom <= view.bottom).toBe(true);
});
