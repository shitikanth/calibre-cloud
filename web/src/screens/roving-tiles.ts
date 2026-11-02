import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { withBrowserModifier } from './shortcut-keys.ts';

type Step = 'previous' | 'next' | 'up' | 'down';

const steps: Partial<Record<string, Step>> = { ArrowLeft: 'previous', ArrowRight: 'next', ArrowUp: 'up', ArrowDown: 'down' };

function columnCount(tiles: HTMLElement[]): number {
  const top = tiles[0]?.offsetTop;
  return tiles.filter((tile) => tile.offsetTop === top).length;
}

function stepFrom(tiles: HTMLElement[], from: number, step: Step): HTMLElement | undefined {
  if (step === 'previous') return tiles[from - 1];
  if (step === 'next') return tiles[from + 1];
  const columns = columnCount(tiles);
  return tiles[step === 'up' ? from - columns : from + columns];
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
        if (from < 0) return;
        event.preventDefault();
        stepFrom(tiles, from, step)?.focus();
      },
    },
  };
}
