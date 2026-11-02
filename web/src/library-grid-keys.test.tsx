import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { savePosition } from './reader/positions.ts';
import { buildCalibreLibrary, type BookSpec } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';
import type { Screen } from './test/screen.ts';

afterEach(async () => {
  await page.viewport(414, 896);
});

function numberedBooks(count: number): BookSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Book ${index + 1}`,
    formats: { EPUB: 'text' },
    added: new Date(Date.UTC(2024, 0, 1) + index * 3_600_000).toISOString().replace('T', ' ').replace('Z', '+00:00'),
  }));
}

async function openLibrary(count: number) {
  const storage = new FakeStorage(await buildCalibreLibrary(numberedBooks(count)));
  const app = await renderApp({ storage, connected: true });
  const grid = app.screen.getByRole('list', { name: 'Books' });
  await expect.element(grid.getByRole('link').first()).toBeVisible();
  return { screen: app.screen, grid };
}

function gridTiles(screen: Screen): HTMLElement[] {
  return screen.getByRole('list', { name: 'Books' }).getByRole('link').elements() as HTMLElement[];
}

function focusedTitle(): string | undefined {
  return document.activeElement?.querySelector('h2, h3')?.textContent ?? undefined;
}

function tileBelow(tiles: HTMLElement[], from: HTMLElement): HTMLElement | undefined {
  const { left, top } = from.getBoundingClientRect();
  return tiles.find((tile) => {
    const rect = tile.getBoundingClientRect();
    return rect.left === left && rect.top > top;
  });
}

test('← and → move through the grid in reading order, across row ends, and stop at the edges', async () => {
  const { screen } = await openLibrary(5);
  gridTiles(screen)[0]!.focus();
  expect(focusedTitle()).toBe('Book 5');

  await userEvent.keyboard('{ArrowLeft}');
  expect(focusedTitle()).toBe('Book 5');
  await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
  expect(focusedTitle()).toBe('Book 2');
  await userEvent.keyboard('{ArrowRight}{ArrowRight}');
  expect(focusedTitle()).toBe('Book 1');
  await userEvent.keyboard('{ArrowLeft}');
  expect(focusedTitle()).toBe('Book 2');
});

test.each([414, 1280])('↑ and ↓ move to the tile directly above and below at %ipx wide, and stop at the edges', async (width) => {
  await page.viewport(width, 900);
  const { screen } = await openLibrary(20);
  const tiles = gridTiles(screen);
  const below = tileBelow(tiles, tiles[0]!)!;
  const columns = tiles.indexOf(below);
  expect(columns).toBeGreaterThan(1);
  tiles[0]!.focus();

  await userEvent.keyboard('{ArrowUp}');
  expect(document.activeElement).toBe(tiles[0]);
  await userEvent.keyboard('{ArrowDown}');
  expect(document.activeElement).toBe(below);
  await userEvent.keyboard('{ArrowUp}');
  expect(document.activeElement).toBe(tiles[0]);

  const last = tiles.at(-1)!;
  last.focus();
  await userEvent.keyboard('{ArrowDown}');
  expect(document.activeElement).toBe(last);
});

test('↓ steps a full row while the pointer rests on a lifted tile', async () => {
  await page.viewport(1280, 900);
  const { screen } = await openLibrary(20);
  const tiles = gridTiles(screen);
  const below = tileBelow(tiles, tiles[0]!)!;
  await userEvent.hover(tiles[0]!);
  await expect.poll(() => getComputedStyle(tiles[0]!).translate).not.toBe('none');
  tiles[0]!.focus();

  await userEvent.keyboard('{ArrowDown}');

  expect(document.activeElement).toBe(below);
});

test('search results move with the arrows like the grid', async () => {
  const { screen } = await openLibrary(12);
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search books' }), 'Book 1');
  await expect.poll(() => gridTiles(screen).length).toBe(4);
  const tiles = gridTiles(screen);
  expect(tiles.filter((tile) => tile.tabIndex === 0)).toEqual([tiles[0]]);
  tiles[0]!.focus();

  await userEvent.keyboard('{ArrowRight}');

  expect(document.activeElement).toBe(tiles[1]);
});

test('the grid is one Tab stop that comes back to the last tile focused', async () => {
  const { screen } = await openLibrary(5);
  const tiles = gridTiles(screen);
  expect(tiles.filter((tile) => tile.tabIndex === 0)).toEqual([tiles[0]]);
  tiles[0]!.focus();
  await userEvent.keyboard('{ArrowRight}{ArrowRight}');
  expect(focusedTitle()).toBe('Book 3');

  await userEvent.keyboard('{Tab}');
  expect(gridTiles(screen)).not.toContain(document.activeElement);
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}');

  expect(focusedTitle()).toBe('Book 3');
});

test('Continue reading is its own Tab stop, and arrows never cross between it and the grid', async () => {
  savePosition({ bookId: 1, format: 'EPUB' }, { location: '1', fraction: 0.1 });
  savePosition({ bookId: 2, format: 'EPUB' }, { location: '1', fraction: 0.2 });
  const { screen } = await openLibrary(5);
  const row = screen.getByRole('region', { name: 'Continue reading' });
  await expect.element(row.getByRole('link').first()).toBeVisible();
  const cards = row.getByRole('link').elements() as HTMLElement[];
  expect(cards.map((card) => card.tabIndex)).toEqual([0, -1]);

  screen.getByRole('searchbox', { name: 'Search books' }).element().focus();
  await userEvent.keyboard('{Tab}{Tab}');
  expect(document.activeElement).toBe(cards[0]);
  await userEvent.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(cards[1]);
  await userEvent.keyboard('{ArrowRight}{ArrowDown}');
  expect(document.activeElement).toBe(cards[1]);

  await userEvent.keyboard('{Tab}');
  expect(document.activeElement).toBe(gridTiles(screen)[0]);
  await userEvent.keyboard('{ArrowUp}{ArrowLeft}');
  expect(document.activeElement).toBe(gridTiles(screen)[0]);
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
  expect(document.activeElement).toBe(cards[1]);
});
