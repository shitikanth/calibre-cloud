import { userEvent } from 'vitest/browser';
import type { renderApp } from './render-app.tsx';

type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

export async function chooseFromMenu(screen: Screen, item: 'Refresh library' | 'Disconnect') {
  await userEvent.click(screen.getByRole('banner').getByRole('button', { name: 'More' }));
  await userEvent.click(screen.getByRole('menuitem', { name: item }));
}
