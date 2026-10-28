import { userEvent } from 'vitest/browser';
import type { Screen } from './screen.ts';

export function chooseScreen(screen: Screen) {
  return screen.getByRole('region', { name: 'Connect your Calibre library' });
}

export async function openMegaStep(screen: Screen) {
  await userEvent.click(chooseScreen(screen).getByRole('link', { name: 'MEGA' }));
  return screen.getByRole('textbox', { name: 'MEGA folder link' });
}

export async function connectMega(screen: Screen, link: string) {
  await userEvent.fill(await openMegaStep(screen), link);
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
}
