import { expect } from 'vitest';
import type { Screen } from './screen.ts';

export async function expectControls(screen: Screen, shown: boolean) {
  for (const bar of [screen.getByRole('banner'), screen.getByRole('contentinfo')]) await expect.element(bar).toHaveStyle({ opacity: shown ? '1' : '0' });
}

export async function showControls(screen: Screen) {
  const back = screen.getByRole('link', { name: 'Back to book' }).element() as HTMLElement;
  back.blur();
  back.focus();
  await expectControls(screen, true);
}
