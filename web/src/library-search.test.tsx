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

test('the search term lives in the URL, so a reload keeps the results', async () => {
  const app = await renderApp({ storage: await bronteLibrary(), connected: true });

  await search(app.screen, 'brontë');
  await expectTitles(app.screen, ['Jane Eyre', 'Wuthering Heights']);
  expect(app.url).toBe('/?q=bront%C3%AB');

  const reloaded = await app.reload();
  await expect.element(reloaded.getByRole('searchbox', { name: 'Search books' })).toHaveValue('brontë');
  await expectTitles(reloaded, ['Jane Eyre', 'Wuthering Heights']);
});

test('a link with a search term opens on its results', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      { title: '1984', authors: ['George Orwell'] },
      { title: 'Animal Farm', authors: ['George Orwell'] },
    ]),
  );
  const app = await renderApp({ storage, connected: true, path: '/?q=1984' });

  await expect.element(app.screen.getByRole('searchbox', { name: 'Search books' })).toHaveValue('1984');
  await expectTitles(app.screen, ['1984']);
});

test('a search that matches nothing says so, and clearing it brings the books back', async () => {
  const app = await renderApp({ storage: await bronteLibrary(), connected: true });

  await search(app.screen, 'tolkien');

  await expect.element(app.screen.getByText('No books match “tolkien”.')).toBeVisible();
  expect(app.screen.getByRole('list', { name: 'Books' }).query()).toBeNull();

  await userEvent.clear(app.screen.getByRole('searchbox', { name: 'Search books' }));

  await expectTitles(app.screen, ['Jane Eyre', 'A Wizard of Earthsea', 'Wuthering Heights']);
  expect(app.screen.getByText(/No books match/).query()).toBeNull();
  expect(app.url).toBe('/');
});

test('percent signs and underscores in a search are matched literally', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      { title: '50% Off', authors: ['A. Writer'] },
      { title: '500 Days', authors: ['A. Writer'] },
      { title: 'snake_case', authors: ['A. Writer'] },
      { title: 'snakescase', authors: ['A. Writer'] },
    ]),
  );
  const app = await renderApp({ storage, connected: true });

  await search(app.screen, '50%');
  await expectTitles(app.screen, ['50% Off']);

  await search(app.screen, 'e_c');
  await expectTitles(app.screen, ['snake_case']);
});

test('search ignores case and accents on both sides', async () => {
  const storage = new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'] },
      { title: 'Les Misérables', authors: ['Victor Hugo'] },
      { title: 'Emma', authors: ['Jane Austen'] },
      { title: 'Nada', authors: ['Carmen Laforet'], tags: ['Ficción española'] },
    ]),
  );
  const app = await renderApp({ storage, connected: true });

  await search(app.screen, 'bronte');
  await expectTitles(app.screen, ['Jane Eyre']);

  await search(app.screen, 'MISÉRABLES');
  await expectTitles(app.screen, ['Les Misérables']);

  await search(app.screen, 'ÉSPANOLA');
  await expectTitles(app.screen, ['Nada']);
});
