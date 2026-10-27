import { afterEach, expect, test, vi } from 'vitest';
import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fixtureUrl from '../../test/fixtures/two-pages.pdf?url';
import type { BookRenderer, Relocation } from '../renderer.ts';
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
  const viewportWidth = canvas.parentElement?.clientWidth ?? 0;
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

test('goToFraction turns to the nearest page, and positionAt names that page without turning', async () => {
  const { renderer, relocations } = await openFixture();

  expect(renderer.positionAt(0.7)).toEqual({ page: { current: 2, total: 2 }, tocEntry: { label: 'Page two', location: '2' } });
  expect(renderer.positionAt(0.3)).toEqual({ page: { current: 1, total: 2 }, tocEntry: { label: 'Page one', location: '1' } });
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
