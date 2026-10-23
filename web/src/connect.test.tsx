import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const link = 'https://mega.nz/folder/TestHandle#TestKey_123';

async function threeBookLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'] },
      { title: 'Wuthering Heights', authors: ['Emily Brontë'] },
      { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'] },
    ]),
  );
}

async function connect(screen: Awaited<ReturnType<typeof renderApp>>['screen'], input: string) {
  await userEvent.fill(screen.getByRole('textbox', { name: 'MEGA folder link' }), input);
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

test('connecting a MEGA folder link shows the book count', async () => {
  const app = await renderApp({ storage: await threeBookLibrary() });

  await connect(app.screen, link);

  await expect.element(app.screen.getByText('3 books')).toBeVisible();
  expect(app.opened).toEqual([{ provider: 'mega', link }]);
});
