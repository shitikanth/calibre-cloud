import { userEvent } from 'vitest/browser';
import type { Screen } from './screen.ts';

export async function chooseFromMenu(screen: Screen, item: 'Refresh library' | 'Disconnect') {
  await userEvent.click(screen.getByRole('banner').getByRole('button', { name: 'More' }));
  await userEvent.click(screen.getByRole('menuitem', { name: item }));
}
