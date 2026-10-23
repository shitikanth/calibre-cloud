import { afterEach, expect, test, vi } from 'vitest';
import type { Relocation } from '../renderer.ts';
import { createEpubRenderer, type EpubRenderer } from './renderer.ts';
import fixtureUrl from '../../test/fixtures/two-chapters.epub?url';

type OpenedBook = { renderer: EpubRenderer; relocations: Relocation[]; container: HTMLElement };

const opened: OpenedBook[] = [];

afterEach(async () => {
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

async function createInContainer(): Promise<OpenedBook> {
  const container = document.createElement('div');
  container.style.cssText = 'width: 600px; height: 800px';
  document.body.append(container);
  const renderer = await createEpubRenderer();
  const relocations: Relocation[] = [];
  renderer.onRelocate((relocation) => relocations.push(relocation));
  const book = { renderer, relocations, container };
  opened.push(book);
  return book;
}

async function openFixture(location?: string): Promise<OpenedBook> {
  const book = await createInContainer();
  const blob = await (await fetch(fixtureUrl)).blob();
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

function goToChapterTwo(renderer: EpubRenderer) {
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

  await goToChapterTwo(renderer);

  expect(renderer.sectionDocument?.getElementById('chapter-two')?.textContent).toBe('Two: The Unsent Letters');
  expect(relocations.at(-1)?.fraction).toBeGreaterThan(opening);
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

test("chapter two's scripts never run: the script resource is refused through the load event and no marker appears", async () => {
  const { renderer } = await openFixture();

  await goToChapterTwo(renderer);
  const doc = renderer.sectionDocument;
  doc?.getElementById('chapter-two')?.click();
  await nextFrame();

  expect(doc?.getElementById('chapter-two')).not.toBeNull();
  expect(doc?.getElementById('ran-inline')).toBeNull();
  expect(doc?.getElementById('ran-handler')).toBeNull();
  expect(doc?.getElementById('ran-external')).toBeNull();
  expect(doc?.querySelector('script')).toBeNull();
  expect(renderer.refusedResources).toEqual(['application/javascript']);
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

test('open rejects when the file is not a book', async () => {
  const { renderer, container } = await createInContainer();

  await expect(renderer.open(new Blob(['not a book']), container, {})).rejects.toThrow();
});

test('arrow keys pressed inside the section document turn the page', async () => {
  const { renderer, relocations } = await openFixture();
  const opening = relocations.at(-1)?.fraction ?? Number.NaN;
  const press = (key: string) => {
    for (const type of ['keydown', 'keyup']) renderer.sectionDocument?.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  };

  press('ArrowRight');
  await vi.waitFor(() => expect(relocations.at(-1)?.fraction).toBeGreaterThan(opening));
  await settled(relocations);
  const turned = relocations.at(-1)?.fraction ?? Number.NaN;

  press('ArrowLeft');
  await vi.waitFor(() => expect(relocations.at(-1)?.fraction).toBeLessThan(turned));
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
