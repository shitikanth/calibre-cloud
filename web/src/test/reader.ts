import { userEvent } from 'vitest/browser';
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

export async function tapZone(screen: Screen, name: 'Previous page' | 'Next page') {
  const zone = screen.getByRole('button', { name }).element().getBoundingClientRect();
  const main = screen.getByRole('main');
  const { left, height } = main.element().getBoundingClientRect();
  await userEvent.click(main, { position: { x: zone.left - left + zone.width / 2, y: height / 2 } });
}
