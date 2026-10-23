import { expect } from 'vitest';
import type { renderApp } from './render-app.tsx';

export type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

export async function expectBooks(screen: Screen, titles: string[]) {
  await expect
    .poll(() =>
      screen
        .getByRole('heading', { level: 2 })
        .elements()
        .map((element) => element.textContent)
        .sort(),
    )
    .toEqual([...titles].sort());
}
