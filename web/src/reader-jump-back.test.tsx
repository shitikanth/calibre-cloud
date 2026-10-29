import { page, userEvent, type Locator } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { createFoliateRenderer } from './reader/foliate/renderer.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { drag, expectControls, release, showControls, tapZone } from './test/reader.ts';
import { renderApp } from './test/render-app.tsx';
import type { Screen } from './test/screen.ts';
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
  await expect.element(app.screen.getByRole('button', { name: 'Next page' })).toBeVisible();
  await showControls(app.screen);
  return { fake, app, screen: app.screen, bar: app.screen.getByRole('slider', { name: 'Position in book' }) };
}

function seek(bar: Locator, value: number) {
  drag(bar, value);
  release(bar);
}

function backButton(screen: Screen) {
  return screen.getByRole('button', { name: /^Back to (page )?\d/ });
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

test('page turns alone never offer Back', async () => {
  const { fake, screen } = await openReader('/books/1/read/EPUB');

  await tapZone(screen, 'Next page');
  await expect.element(screen.getByText('line 2')).toBeVisible();
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(screen.getByText('line 3')).toBeVisible();
  fake.latest.swipe('next');
  await expect.element(screen.getByText('# Chapter two')).toBeVisible();
  await userEvent.click(screen.getByRole('main'), { position: { x: 10, y: 10 } });
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await showControls(screen);

  expect(backButton(screen).query()).toBeNull();
});

test('Back is still offered after two page turns, either way, and goes on the third', async () => {
  const { fake, screen, bar } = await openReader('/books/1/read/EPUB');
  seek(bar, 50);
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await expect.element(backButton(screen)).toBeInTheDocument();

  await tapZone(screen, 'Next page');
  await expect.element(screen.getByText('# Chapter two')).toBeVisible();
  await userEvent.keyboard('{ArrowLeft}');
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await showControls(screen);
  await expect.element(backButton(screen)).toBeVisible();

  fake.latest.swipe('next');
  await expect.element(screen.getByText('# Chapter two')).toBeVisible();

  await expect.poll(() => backButton(screen).query()).toBeNull();
});

test('after a seek then a contents jump, Back returns to before the first, and the turn count starts again from the second', async () => {
  const { fake, screen, bar } = await openReader('/books/1/read/EPUB');
  await fake.latest.next();
  await expect.element(screen.getByText('line 2')).toBeVisible();
  seek(bar, 50);
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await tapZone(screen, 'Next page');
  await tapZone(screen, 'Next page');
  await expect.element(screen.getByText('line 5')).toBeVisible();

  await showControls(screen);
  await userEvent.click(screen.getByRole('button', { name: 'Table of contents' }));
  await userEvent.click(screen.getByRole('navigation', { name: 'Table of contents' }).getByRole('button', { name: 'Chapter one' }));
  await expect.element(screen.getByText('# Chapter one')).toBeVisible();
  await tapZone(screen, 'Next page');
  await tapZone(screen, 'Next page');
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await showControls(screen);
  const back = screen.getByRole('contentinfo').getByRole('button', { name: 'Back to 25%' });
  await expect.element(back).toBeVisible();

  await userEvent.click(back);

  await expect.element(screen.getByText('line 2')).toBeVisible();
});

test('a seek that lands where you are offers no Back, and nor do page turns after it', async () => {
  const { fake, screen, bar } = await openReader('/books/1/read/PDF');
  await fake.latest.next();
  await expect.element(screen.getByText('Page two')).toBeVisible();

  seek(bar, 2);
  await expect.poll(() => fake.latest.calls.at(-1)).toEqual({ op: 'goToFraction', fraction: 0.5 });
  await tapZone(screen, 'Next page');
  await expect.element(screen.getByText('Page three')).toBeVisible();
  await showControls(screen);

  expect(backButton(screen).query()).toBeNull();
});

test('Back is the next stop after the bar for a keyboard, and goes and comes with the controls', async () => {
  const { fake, screen, bar } = await openReader('/books/1/read/EPUB');
  await fake.latest.next();
  seek(bar, 100);
  await expect.element(screen.getByText('line 5')).toBeVisible();
  const back = screen.getByRole('contentinfo').getByRole('button', { name: 'Back to 25%' });
  await expect.element(back).toBeVisible();

  await userEvent.keyboard('{Escape}');
  await expectControls(screen, false);

  (bar.element() as HTMLElement).focus();
  await userEvent.keyboard('{Tab}');
  await expectControls(screen, true);
  await expect.element(back).toHaveFocus();
  await userEvent.keyboard('{Enter}');

  await expect.element(screen.getByText('line 2')).toBeVisible();
});

test.each([
  [390, 844],
  [1280, 800],
])('at %i×%i, Back sits at the bottom left of the controls, clear of the place and the tools', async (width, height) => {
  await page.viewport(width, height);
  const { screen, bar } = await openReader('/books/1/read/EPUB');
  seek(bar, 100);
  const controls = screen.getByRole('contentinfo');
  const back = controls.getByRole('button', { name: 'Back to 0%' });
  await expect.element(back).toBeVisible();

  const pill = back.element().getBoundingClientRect();
  const panel = controls.element().getBoundingClientRect();
  const where = controls.getByText('Chapter two · 100%').element().getBoundingClientRect();
  expect(pill.left).toBeGreaterThanOrEqual(panel.left);
  expect(pill.left - panel.left).toBeLessThan(panel.width / 4);
  expect(pill.top).toBeGreaterThanOrEqual(bar.element().getBoundingClientRect().bottom);
  expect(pill.right).toBeLessThanOrEqual(where.left);
  for (const tool of controls.getByRole('button', { name: /Table of contents|Settings/ }).elements())
    expect(pill.right).toBeLessThanOrEqual(tool.getBoundingClientRect().left);
});

test('with the real EPUB renderer, a seek offers Back and Back returns there', async () => {
  const files = await buildCalibreLibrary([{ title: 'Two Chapters', authors: ['Calibre Cloud'], formats: { EPUB: '' } }]);
  files['Calibre Cloud/Two Chapters (1)/Two Chapters - Calibre Cloud.epub'] = new Uint8Array(await (await fetch(twoChaptersUrl)).arrayBuffer());
  const app = await renderApp({
    storage: new FakeStorage(files),
    connected: true,
    path: '/books/1/read/EPUB',
    renderers: { EPUB: () => createFoliateRenderer('epub') },
  });
  const screen = app.screen;
  await expect.element(screen.getByRole('button', { name: 'Next page' })).toBeVisible();
  await showControls(screen);
  const bar = screen.getByRole('slider', { name: 'Position in book' });
  await expect.poll(() => bar.element().getAttribute('aria-valuetext')).toMatch(/^\d+%$/);
  const start = bar.element().getAttribute('aria-valuetext') ?? '';

  seek(bar, 100);

  const back = screen.getByRole('contentinfo').getByRole('button', { name: `Back to ${start}` });
  await expect.element(back).toBeVisible();
  await expect.element(bar).not.toHaveAttribute('aria-valuetext', start);

  await userEvent.click(back);

  await expect.element(bar).toHaveAttribute('aria-valuetext', start);
  await expect.poll(() => back.query()).toBeNull();
});

test('a table-of-contents jump offers Back too, and Back returns there, goes away, and is where the book reopens', async () => {
  const { fake, app, screen } = await openReader('/books/1/read/EPUB');
  await fake.latest.next();
  await expect.element(screen.getByText('line 2')).toBeVisible();

  await userEvent.click(screen.getByRole('button', { name: 'Table of contents' }));
  await userEvent.click(screen.getByRole('navigation', { name: 'Table of contents' }).getByRole('button', { name: 'Chapter two' }));
  await expect.element(screen.getByText('# Chapter two')).toBeVisible();
  const back = screen.getByRole('contentinfo').getByRole('button', { name: 'Back to 25%' });
  await expect.element(back).toBeVisible();

  await userEvent.click(back);

  await expect.element(screen.getByText('line 2')).toBeVisible();
  expect(fake.latest.calls.at(-1)).toEqual({ op: 'goTo', location: '2' });
  await expect.poll(() => back.query()).toBeNull();

  const reloaded = await app.reload();
  await expect.element(reloaded.getByText('line 2')).toBeVisible();
  expect(fake.latest.opened?.location).toBe('2');
});
