import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

async function bronteLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'] },
      { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'] },
      { title: 'Wuthering Heights', authors: ['Emily Brontë'] },
    ]),
  );
}

async function search(screen: Screen, term: string) {
  const box = screen.getByRole('searchbox', { name: 'Search books' });
  await userEvent.clear(box);
  await userEvent.type(box, term);
}

async function expectTitles(screen: Screen, titles: string[]) {
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

test('typing in the search box narrows the grid to books whose title matches', async () => {
  const app = await renderApp({ storage: await bronteLibrary(), connected: true });
  await expectTitles(app.screen, ['Jane Eyre', 'A Wizard of Earthsea', 'Wuthering Heights']);

  await search(app.screen, 'earthsea');

  await expectTitles(app.screen, ['A Wizard of Earthsea']);
});

test('search matches author names', async () => {
  const app = await renderApp({ storage: await bronteLibrary(), connected: true });

  await search(app.screen, 'le guin');

  await expectTitles(app.screen, ['A Wizard of Earthsea']);
});

test('search matches series names', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'], series: 'Earthsea Cycle' },
      { title: 'The Tombs of Atuan', authors: ['Ursula K. Le Guin'], series: 'Earthsea Cycle' },
      { title: 'The Dispossessed', authors: ['Ursula K. Le Guin'], series: 'Hainish Cycle' },
    ]),
  );
  const app = await renderApp({ storage, connected: true });

  await search(app.screen, 'earthsea cycle');

  await expectTitles(app.screen, ['A Wizard of Earthsea', 'The Tombs of Atuan']);
});

test('search matches tag names', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'], tags: ['Classics', 'Gothic Fiction'] },
      { title: 'Dracula', authors: ['Bram Stoker'], tags: ['Horror', 'Gothic Fiction'] },
      { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'], tags: ['Fantasy'] },
    ]),
  );
  const app = await renderApp({ storage, connected: true });

  await search(app.screen, 'gothic');

  await expectTitles(app.screen, ['Jane Eyre', 'Dracula']);
});
