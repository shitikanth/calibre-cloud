import { page, userEvent, type Locator } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { showControls, tapZone } from './test/reader.ts';
import { renderApp } from './test/render-app.tsx';
import type { Screen } from './test/screen.ts';

const epub = ['# Chapter one', 'line 2', 'line 3', '# Chapter two', 'line 5'].join('\n');
const pdf = ['Page one', 'Page two', 'Page three'].join('\n');
const thumb = 16;

afterEach(async () => {
  await page.viewport(414, 896);
});

async function janeEyreLibrary(book = epub) {
  return new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: book, PDF: pdf } }]),
  );
}

async function openReader(path: string, storage?: FakeStorage) {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage: storage ?? (await janeEyreLibrary()), connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByRole('button', { name: 'Next page' })).toBeVisible();
  await showControls(app.screen);
  const bar = app.screen.getByRole('slider', { name: 'Position in book' });
  return { fake, app, bar, place: app.screen.getByRole('contentinfo') };
}

function thumbCentre(bar: Locator, fraction: number) {
  const { left, width } = bar.element().getBoundingClientRect();
  return left + thumb / 2 + (width - thumb) * fraction;
}

test('the bar is a slider showing how far through the book, and it follows page turns', async () => {
  const { app, bar } = await openReader('/books/1/read/EPUB');
  await expect.element(bar).toHaveAttribute('aria-valuetext', '0%');

  await tapZone(app.screen, 'Next page');

  await expect.element(bar).toHaveAttribute('aria-valuetext', '25%');
  await expect.element(bar).toHaveValue('25');
});

test('in a paged book the bar counts pages', async () => {
  const { app, bar } = await openReader('/books/1/read/PDF');
  await expect.element(bar).toHaveAttribute('aria-valuetext', 'page 1 of 3');

  await tapZone(app.screen, 'Next page');

  await expect.element(bar).toHaveAttribute('aria-valuetext', 'page 2 of 3');
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

function popupTitled(place: Locator, title: string) {
  const heading = place.getByText(title, { exact: true });
  return { heading, card: () => heading.element().parentElement as HTMLElement };
}

test('dragging shows a card over the thumb naming the chapter it would land in and the %, and jumps only on release', async () => {
  const { fake, app, bar, place } = await openReader('/books/1/read/EPUB');

  drag(bar, 75);

  const popup = popupTitled(place, 'Chapter two');
  await expect.element(popup.heading).toBeVisible();
  const card = popup.card();
  const percent = card.lastElementChild as HTMLElement;
  expect(percent.textContent).toBe('75%');
  const { left, right, bottom } = card.getBoundingClientRect();
  expect((left + right) / 2).toBeCloseTo(thumbCentre(bar, 0.75), 0);
  expect(bottom).toBeLessThanOrEqual(bar.element().getBoundingClientRect().top);
  const where = place.getByText('Chapter one · 0%', { exact: true });
  await expect.element(where).toBeVisible();
  const page = getComputedStyle(app.screen.getByRole('main').element().parentElement as HTMLElement);
  expect(getComputedStyle(card).backgroundColor).toBe(page.backgroundColor);
  expect(Number(getComputedStyle(popup.heading.element()).fontWeight)).toBeGreaterThanOrEqual(600);
  expect(getComputedStyle(popup.heading.element()).color).toBe(page.color);
  expect(getComputedStyle(percent).color).toBe(getComputedStyle(where.element()).color);
  await expect.element(bar).toHaveAttribute('aria-valuetext', '75%');
  await expect.element(app.screen.getByText('# Chapter one')).toBeVisible();
  expect(fake.latest.calls.filter(({ op }) => op === 'goToFraction')).toEqual([]);

  release(bar);

  await expect.element(app.screen.getByText('# Chapter two')).toBeVisible();
  expect(fake.latest.calls).toContainEqual({ op: 'goToFraction', fraction: 0.75 });
  await expect.element(place.getByText('Chapter two · 75%', { exact: true })).toBeVisible();
  await expect.poll(() => popup.heading.query()).toBeNull();
});

test('the card stays on screen at both ends, and a long chapter title ends in an ellipsis', async () => {
  await page.viewport(390, 844);
  const long = 'Chapter the second, in which a great many things happen to a great many people';
  const { bar, place } = await openReader('/books/1/read/EPUB', await janeEyreLibrary(epub.replace('Chapter two', long)));

  drag(bar, 100);
  const end = popupTitled(place, long);
  await expect.element(end.heading).toBeVisible();
  const { left, right } = end.card().getBoundingClientRect();
  expect(left).toBeGreaterThanOrEqual(0);
  expect(right).toBeLessThanOrEqual(390);
  const title = end.heading.element() as HTMLElement;
  expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
  expect(getComputedStyle(title).textOverflow).toBe('ellipsis');

  drag(bar, 1);
  const start = popupTitled(place, 'Chapter one');
  await expect.element(start.heading).toBeVisible();
  expect(start.card().getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
});

test('dragging away and back to where it started leaves the bar following page turns', async () => {
  const { app, bar, place } = await openReader('/books/1/read/EPUB');

  drag(bar, 75);
  await expect.element(place.getByText('Chapter two', { exact: true })).toBeVisible();
  drag(bar, 0);
  await expect.poll(() => place.getByText('Chapter two', { exact: true }).query()).toBeNull();
  await tapZone(app.screen, 'Next page');

  await expect.element(bar).toHaveAttribute('aria-valuetext', '25%');
  await expect.element(app.screen.getByRole('main').getByText('25%', { exact: true })).toBeVisible();
});


test('dragging in a paged book previews the page number', async () => {
  const { app, bar, place } = await openReader('/books/1/read/PDF');

  drag(bar, 3);

  await expect.element(place.getByText('page 3 of 3', { exact: true })).toBeVisible();
  await expect.element(place.getByText('page 1 of 3', { exact: true })).toBeVisible();
  await expect.element(app.screen.getByText('Page one')).toBeVisible();
});

test('clicking the bar jumps there, and the jump is saved like a page turn', async () => {
  const { fake, app, bar } = await openReader('/books/1/read/PDF');
  const { width, height } = bar.element().getBoundingClientRect();

  await userEvent.click(bar, { position: { x: width - 2, y: height / 2 } });

  await expect.element(app.screen.getByText('Page three')).toBeVisible();
  await expect.element(bar).toHaveAttribute('aria-valuetext', 'page 3 of 3');
  expect(fake.latest.calls).toContainEqual({ op: 'goToFraction', fraction: 1 });

  const reloaded = await app.reload();
  await expect.element(reloaded.getByText('Page three')).toBeVisible();
  expect(fake.latest.opened?.location).toBe('3');
});

test('arrow keys step the focused bar without also turning the page', async () => {
  const { fake, app, bar } = await openReader('/books/1/read/PDF');

  await tapZone(app.screen, 'Next page');
  await expect.element(bar).toHaveAttribute('aria-valuetext', 'page 2 of 3');
  (bar.element() as HTMLInputElement).focus();
  await userEvent.keyboard('{ArrowLeft}');

  await expect.element(app.screen.getByText('Page one')).toBeVisible();
  await expect.element(bar).toHaveAttribute('aria-valuetext', 'page 1 of 3');
  expect(fake.latest.calls.filter(({ op }) => op === 'previous')).toEqual([]);

  await userEvent.keyboard('{ArrowRight}');
  await expect.element(app.screen.getByText('Page two')).toBeVisible();
  expect(fake.latest.calls.filter(({ op }) => op === 'next')).toHaveLength(1);
});

type Rgb = [number, number, number];

async function pixels(target: Locator): Promise<(x: number, y: number) => Rgb> {
  const base64 = await target.screenshot({ save: false });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  context?.drawImage(image, 0, 0);
  const { left, top, width } = target.element().getBoundingClientRect();
  const scale = image.width / width;
  return (x, y) => {
    const [r = 0, g = 0, b = 0] = context?.getImageData(Math.round((x - left) * scale), Math.round((y - top) * scale), 1, 1).data ?? [];
    return [r, g, b];
  };
}

function rgbOf(color: string): Rgb {
  const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return color.startsWith('color(') ? [r * 255, g * 255, b * 255] : [r, g, b];
}

function near(actual: Rgb, expected: Rgb) {
  return actual.every((channel, index) => Math.abs(channel - (expected[index] ?? 0)) <= 3);
}

async function chooseTheme(screen: Screen, theme: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
  await userEvent.click(screen.getByRole('radio', { name: theme }));
  await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
}

test.each(['Light', 'Sepia', 'Dark'])('in %s, the bar is a thin track in the muted colour, filled up to a thumb centred on it', async (theme) => {
  const { app, bar, place } = await openReader('/books/1/read/EPUB');
  await chooseTheme(app.screen, theme);
  await tapZone(app.screen, 'Next page');
  await tapZone(app.screen, 'Next page');
  await showControls(app.screen);
  await expect.element(bar).toHaveAttribute('aria-valuetext', '50%');
  const muted = rgbOf(getComputedStyle(place.getByText('Chapter one · 50%').element()).color);
  const at = await pixels(bar);
  const { top, height } = bar.element().getBoundingClientRect();
  const middle = top + height / 2;
  const centre = thumbCentre(bar, 0.5);

  expect(near(at(centre, middle), muted)).toBe(true);
  expect(near(at(centre, middle - thumb / 2 + 2), muted)).toBe(true);
  expect(near(at(centre, middle + thumb / 2 - 2), muted)).toBe(true);
  expect(near(at(centre - thumb, middle), muted)).toBe(true);
  expect(near(at(centre + thumb, middle), muted)).toBe(false);
  expect(near(at(centre - thumb, middle - 4), muted)).toBe(false);
  expect(near(at(centre - thumb, middle + 4), muted)).toBe(false);
});
