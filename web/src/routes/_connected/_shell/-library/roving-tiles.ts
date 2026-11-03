import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { withBrowserModifier } from '../../-connected/shortcut-keys.ts';

type Step = 'previous' | 'next' | 'up' | 'down' | 'first' | 'last' | 'pageUp' | 'pageDown';

const steps: Partial<Record<string, Step>> = {
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'first',
  End: 'last',
  PageUp: 'pageUp',
  PageDown: 'pageDown',
};

function columnCount(tiles: HTMLElement[]): number {
  const top = tiles[0]?.offsetTop;
  return tiles.filter((tile) => tile.offsetTop === top).length;
}

function rowsPerScreen(tiles: HTMLElement[], columns: number): number {
  const first = tiles[0];
  if (!first) return 1;
  const pitch = (tiles[columns]?.offsetTop ?? first.offsetTop) - first.offsetTop || first.offsetHeight;
  return Math.max(1, Math.floor(window.innerHeight / pitch));
}

function stepFrom(tiles: HTMLElement[], from: number, step: Step): HTMLElement | undefined {
  if (step === 'previous') return tiles[from - 1];
  if (step === 'next') return tiles[from + 1];
  if (step === 'first') return tiles[0];
  if (step === 'last') return tiles.at(-1);
  const columns = columnCount(tiles);
  if (step === 'up') return tiles[from - columns];
  if (step === 'down') return tiles[from + columns];
  const screen = columns * rowsPerScreen(tiles, columns);
  return tiles[step === 'pageUp' ? Math.max(from - screen, 0) : Math.min(from + screen, tiles.length - 1)];
}

export type RovingTiles = {
  tileProps: (key: string) => { tabIndex: number; 'data-tile': string };
  listProps: { onFocus: (event: FocusEvent<HTMLElement>) => void; onKeyDown: (event: KeyboardEvent<HTMLElement>) => void };
};

export function useRovingTiles(keys: string[]): RovingTiles {
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const active = focused !== undefined && keys.includes(focused) ? focused : keys[0];
  const tilesIn = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('[data-tile]')];

  return {
    tileProps: (key) => ({ tabIndex: key === active ? 0 : -1, 'data-tile': key }),
    listProps: {
      onFocus: (event) => {
        if (event.target instanceof HTMLElement && event.target.dataset['tile'] !== undefined) setFocused(event.target.dataset['tile']);
      },
      onKeyDown: (event) => {
        const step = steps[event.key];
        if (!step || withBrowserModifier(event.nativeEvent) || event.shiftKey) return;
        const tiles = tilesIn(event.currentTarget);
        const from = tiles.indexOf(event.target as HTMLElement);
        const current = tiles[from];
        if (!current) return;
        event.preventDefault();
        const target = stepFrom(tiles, from, step);
        if (!target) return;
        if (step === 'pageUp' || step === 'pageDown') window.scrollBy(0, target.getBoundingClientRect().top - current.getBoundingClientRect().top);
        target.focus();
      },
    },
  };
}
