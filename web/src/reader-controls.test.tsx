import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { createFoliateRenderer, type FoliateRenderer } from './reader/foliate/renderer.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { expectControls, showControls, tapZone } from './test/reader.ts';
import { renderApp } from './test/render-app.tsx';
import twoChaptersUrl from './test/fixtures/two-chapters.epub?url';

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
  await expect.element(app.screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
  return { fake, app, screen: app.screen };
}

function rect(element: Element) {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

test('while reading only the running head and folio show, and a tap in the middle shows and hides the controls without moving the page', async () => {
  const { screen } = await openReader('/books/1/read/EPUB');
  const runningHead = screen.getByText('Chapter one', { exact: true });
  const folio = screen.getByRole('main').getByText('0%', { exact: true });
  await expect.element(runningHead).toBeVisible();
  await expect.element(folio).toBeVisible();
  await expectControls(screen, false);
  const text = screen.getByText('# Chapter one');
  const before = rect(text.element());

  await userEvent.click(text);

  await expectControls(screen, true);
  await expect.element(runningHead).not.toBeVisible();
  await expect.element(folio).not.toBeVisible();
  await expect.element(screen.getByText('Chapter one · 0%')).toBeVisible();
  expect(rect(text.element())).toEqual(before);

  await userEvent.click(text);

  await expectControls(screen, false);
  await expect.element(runningHead).toBeVisible();
});

test('a paged book’s folio counts pages', async () => {
  const { screen } = await openReader('/books/1/read/PDF');

  await expect.element(screen.getByRole('main').getByText('page 1 of 3', { exact: true })).toBeVisible();
});

test('the outer 22% on each side are Previous page and Next page buttons, and every kind of page turn hides the controls', async () => {
  const { fake, screen } = await openReader('/books/1/read/EPUB');
  const previous = screen.getByRole('button', { name: 'Previous page' });
  const next = screen.getByRole('button', { name: 'Next page' });
  for (const zone of [previous, next]) expect(rect(zone.element()).width / window.innerWidth).toBeCloseTo(0.22, 2);
  expect(rect(previous.element()).x).toBe(0);
  expect(rect(next.element()).x + rect(next.element()).width).toBe(window.innerWidth);

  await tapZone(screen, 'Next page');
  await expect.element(screen.getByText('line 2')).toBeVisible();

  await showControls(screen);
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await expectControls(screen, false);

  await showControls(screen);
  await tapZone(screen, 'Previous page');
  await expect.element(screen.getByText('line 2')).toBeVisible();
  await expectControls(screen, false);

  await showControls(screen);
  fake.latest.swipe('next');
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await expectControls(screen, false);

  await userEvent.click(screen.getByRole('main'), { position: { x: 10, y: 10 } });
  await expect.element(screen.getByText('line 2')).toBeVisible();
  await expectControls(screen, false);
});

test('the page-turn zones are buttons a keyboard can press', async () => {
  const { screen } = await openReader('/books/1/read/EPUB');
  const next = screen.getByRole('button', { name: 'Next page' });

  (next.element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');

  await expect.element(screen.getByText('line 2')).toBeVisible();
});

test('Tab into the controls shows them and Esc hides them', async () => {
  const { screen } = await openReader('/books/1/read/EPUB');

  await userEvent.keyboard('{Tab}');

  await expect.element(screen.getByRole('link', { name: 'Back to book' })).toHaveFocus();
  await expectControls(screen, true);

  await userEvent.keyboard('{Escape}');

  await expectControls(screen, false);
});

test('Esc closes an open Contents first and leaves the controls up', async () => {
  const { screen } = await openReader('/books/1/read/EPUB');
  await showControls(screen);
  await userEvent.click(screen.getByRole('button', { name: 'Table of contents' }));
  await expect.element(screen.getByRole('navigation', { name: 'Table of contents' })).toBeVisible();

  await userEvent.keyboard('{Escape}');

  await expect.poll(() => screen.getByRole('navigation', { name: 'Table of contents' }).query()).toBeNull();
  await expectControls(screen, true);
});

test('on a phone, Contents and Settings sit at the bottom right', async () => {
  await page.viewport(390, 844);
  const { screen } = await openReader('/books/1/read/EPUB');
  await showControls(screen);
  const bottom = screen.getByRole('contentinfo');

  for (const name of ['Table of contents', 'Settings']) {
    const tool = bottom.getByRole('button', { name });
    await expect.element(tool).toBeVisible();
    expect(rect(tool.element()).x).toBeGreaterThan(390 / 2);
  }
  expect(screen.getByRole('banner').getByRole('button').elements()).toEqual([]);
});

test('on a desktop, Contents and Settings sit at the top right and the bottom panel is at most 560 px wide', async () => {
  await page.viewport(1280, 800);
  const { screen } = await openReader('/books/1/read/EPUB');
  await showControls(screen);
  const top = screen.getByRole('banner');

  for (const name of ['Table of contents', 'Settings']) {
    const tool = top.getByRole('button', { name });
    await expect.element(tool).toBeVisible();
    expect(rect(tool.element()).x).toBeGreaterThan(1280 / 2);
  }
  expect(rect(screen.getByRole('contentinfo').element()).width).toBeLessThanOrEqual(560);
});

function pressInBook(element: Element | null | undefined, x: number) {
  const frame = (element?.ownerDocument.defaultView?.frameElement as HTMLElement).getBoundingClientRect();
  element?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x - frame.left }));
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x - frame.left }));
}

async function openRealEpub() {
  const files = await buildCalibreLibrary([{ title: 'Two Chapters', authors: ['Calibre Cloud'], formats: { EPUB: '' } }]);
  files['Calibre Cloud/Two Chapters (1)/Two Chapters - Calibre Cloud.epub'] = new Uint8Array(await (await fetch(twoChaptersUrl)).arrayBuffer());
  let renderer: FoliateRenderer | undefined;
  const app = await renderApp({
    storage: new FakeStorage(files),
    connected: true,
    path: '/books/1/read/EPUB',
    renderers: { EPUB: async () => (renderer = await createFoliateRenderer('epub')) },
  });
  await expect.poll(() => renderer?.sectionDocument?.querySelector('p')).toBeTruthy();
  await expect.element(app.screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
  return { app, screen: app.screen, renderer: renderer as FoliateRenderer };
}

test('with the real EPUB renderer, a tap on the page shows the controls, a press on it closes an open Contents, and Esc inside the book hides them', async () => {
  const { screen, renderer } = await openRealEpub();
  const paragraph = renderer.sectionDocument?.querySelector('p') as HTMLElement;
  const press = () => pressInBook(paragraph, window.innerWidth / 2);

  press();
  await expectControls(screen, true);
  await userEvent.click(screen.getByRole('button', { name: 'Table of contents' }));
  const contents = screen.getByRole('navigation', { name: 'Table of contents' });
  await expect.element(contents).toBeVisible();

  press();
  await expect.poll(() => contents.query()).toBeNull();
  await expectControls(screen, false);

  press();
  await expectControls(screen, true);
  (renderer.sectionDocument?.defaultView?.frameElement as HTMLElement).focus();
  await userEvent.keyboard('{Escape}');
  await expectControls(screen, false);
});

test('with the real EPUB renderer, a tap at the edge of the page turns it, but a click on a link there follows the link', async () => {
  const { screen, renderer } = await openRealEpub();
  const folio = screen.getByRole('main').getByText(/^\d+%$/);
  await expect.element(folio).toBeVisible();
  const opening = folio.element().textContent;

  pressInBook(renderer.sectionDocument?.querySelector('p'), window.innerWidth - 10);

  await expect.poll(() => folio.element().textContent).not.toBe(opening);
  expect(renderer.sectionDocument?.getElementById('chapter-two')).toBeNull();
  await expectControls(screen, false);

  const linkInZone = () => {
    const doc = renderer.sectionDocument;
    const frame = (doc?.defaultView?.frameElement as HTMLElement).getBoundingClientRect();
    return [...(doc?.getElementById('links')?.querySelectorAll('a') ?? [])]
      .flatMap((link) => [...link.getClientRects()])
      .map((line) => ({ x: frame.left + line.left + 4, y: frame.top + line.top + line.height / 2 }))
      .find(({ x }) => x >= 0 && x < window.innerWidth * 0.22);
  };
  for (let turns = 0; !linkInZone() && turns < 6; turns += 1) {
    const before = folio.element().textContent;
    pressInBook(renderer.sectionDocument?.querySelector('p'), window.innerWidth - 10);
    await expect.poll(() => folio.element().textContent).not.toBe(before);
  }
  const link = linkInZone();
  expect(link).toBeDefined();
  const main = screen.getByRole('main');
  const { left, top } = main.element().getBoundingClientRect();
  const position = folio.element().textContent;

  await userEvent.click(main, { position: { x: (link?.x ?? 0) - left, y: (link?.y ?? 0) - top } });

  await expect
    .poll(() => screen.getByRole('dialog', { name: 'Open this link?' }).query() ?? renderer.sectionDocument?.getElementById('chapter-two'))
    .toBeTruthy();
  expect(folio.element().textContent === position || renderer.sectionDocument?.getElementById('chapter-two')).toBeTruthy();
});

test.each([
  [390, 844],
  [1280, 800],
])('at %i×%i, the running head and folio never overlap the real EPUB renderer’s text', async (width, height) => {
  await page.viewport(width, height);
  const { app, renderer } = await openRealEpub();
  const runningHead = app.screen.getByText('One: The Lighthouse Ledger', { exact: true });
  await expect.element(runningHead).toBeVisible();
  const folio = app.screen.getByRole('main').getByText(/^\d+%$/);
  await expect.element(folio).toBeVisible();
  const doc = renderer?.sectionDocument;
  const frame = (doc?.defaultView?.frameElement as HTMLElement).getBoundingClientRect();

  const lines = [...(doc?.querySelectorAll('h1, h2, p') ?? [])]
    .flatMap((element) => [...element.getClientRects()])
    .map((line) => ({ left: frame.left + line.left, top: frame.top + line.top, bottom: frame.top + line.bottom }))
    .filter((line) => line.left >= 0 && line.left < width);

  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line.top).toBeGreaterThanOrEqual(runningHead.element().getBoundingClientRect().bottom);
    expect(line.bottom).toBeLessThanOrEqual(folio.element().getBoundingClientRect().top);
  }
});

test('on a desktop, the pointer at the top or bottom edge shows the controls, other movement does not, and they go once it leaves', async () => {
  await page.viewport(1280, 800);
  const { screen } = await openReader('/books/1/read/EPUB');
  const main = screen.getByRole('main');

  await userEvent.hover(main, { position: { x: 640, y: 400 } });
  await userEvent.hover(main, { position: { x: 640, y: 300 } });
  await expectControls(screen, false);

  await userEvent.hover(main, { position: { x: 640, y: 1 }, force: true });
  await expectControls(screen, true);
  await userEvent.hover(screen.getByRole('banner'));
  await expectControls(screen, true);

  await userEvent.hover(main, { position: { x: 640, y: 400 } });
  await expectControls(screen, false);

  await userEvent.hover(main, { position: { x: 640, y: 799 }, force: true });
  await expectControls(screen, true);
});
