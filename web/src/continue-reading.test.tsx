import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { savePosition } from './reader/positions.ts';
import { buildCalibreLibrary, type BookSpec } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { chooseFromMenu } from './test/app-bar.ts';
import { renderApp, testLink } from './test/render-app.tsx';
import type { Screen } from './test/screen.ts';

const epub = ['# One', 'line 2', 'line 3', 'line 4', 'line 5'].join('\n');
const pdf = ['Page one', 'Page two', 'Page three'].join('\n');

const titles = ['Jane Eyre', 'Wuthering Heights', 'Agnes Grey', 'Villette', 'Shirley', 'The Professor', 'The Tenant of Wildfell Hall'];

const books: BookSpec[] = titles.map((title, index) => ({
  title,
  authors: ['Brontë'],
  hasCover: index === 0,
  formats: { EPUB: epub, PDF: pdf },
}));

async function bronteLibrary(specs = books) {
  return new FakeStorage(await buildCalibreLibrary(specs));
}

async function startApp(storage: FakeStorage, path = '/') {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path, renderers: fake.renderers });
  return { fake, app };
}

type Started = Awaited<ReturnType<typeof startApp>>;

async function read({ fake, app }: Started, bookId: number, format: string, pages = 0) {
  const opened = fake.instances.length;
  app.navigate(`/books/${bookId}/read/${format}`);
  await expect.poll(() => fake.instances.length === opened + 1 && fake.latest.opened !== undefined).toBe(true);
  const next = app.screen.getByRole('button', { name: 'Next' });
  await expect.element(next).toBeVisible();
  for (let page = 0; page < pages; page += 1) await userEvent.click(next);
}

function continueReading(screen: Screen) {
  return screen.getByRole('region', { name: 'Continue reading' });
}

function cardTitles(screen: Screen) {
  return continueReading(screen)
    .getByRole('heading', { level: 3 })
    .elements()
    .map((heading) => heading.textContent);
}

test('the home view lists the six most recently opened formats, newest first, with cover, title, format and percent', async () => {
  const started = await startApp(await bronteLibrary());
  const { app } = started;
  for (const [index] of titles.entries()) await read(started, index + 1, 'EPUB', index === 4 ? 1 : 0);
  await read(started, 1, 'PDF', 2);
  app.navigate('/');

  await expect.element(continueReading(app.screen)).toBeVisible();
  await expect.poll(() => cardTitles(app.screen)).toEqual([
    'Jane Eyre',
    'The Tenant of Wildfell Hall',
    'The Professor',
    'Shirley',
    'Villette',
    'Agnes Grey',
  ]);
  const row = continueReading(app.screen);
  await expect.element(row.getByRole('link', { name: /Shirley/ })).toMatchTextContent(/Shirley.*EPUB.*25%/);
  await expect.element(row.getByRole('link', { name: /Jane Eyre/ })).toMatchTextContent(/Jane Eyre.*PDF.*100%/);
  await expect.element(row.getByRole('link', { name: /Agnes Grey/ })).toMatchTextContent(/Agnes Grey.*EPUB.*0%/);
  await expect.element(row.getByRole('img', { name: 'Cover of Jane Eyre' })).toHaveAttribute('src', expect.stringMatching(/^blob:/));
  await expect.element(row.getByRole('img', { name: 'No cover for Shirley' })).toBeVisible();
  await expect.element(app.screen.getByRole('list', { name: 'Books' })).toBeVisible();
});

test('a position whose book left the library before Refresh library is skipped and the row still shows six', async () => {
  const started = await startApp(await bronteLibrary());
  const { app } = started;
  for (const [index] of titles.entries()) await read(started, index + 1, 'EPUB');
  savePosition({ bookId: 99, format: 'EPUB' }, { location: '2', fraction: 0.5 });
  app.navigate('/');

  await expect.poll(() => cardTitles(app.screen)).toEqual([
    'The Tenant of Wildfell Hall',
    'The Professor',
    'Shirley',
    'Villette',
    'Agnes Grey',
    'Wuthering Heights',
  ]);
});

test('the row stays out of the way with nothing to continue and while searching', async () => {
  const started = await startApp(await bronteLibrary());
  const { app } = started;
  await expect.element(app.screen.getByRole('list', { name: 'Books' })).toBeVisible();
  expect(continueReading(app.screen).query()).toBeNull();

  await read(started, 2, 'EPUB', 1);
  app.navigate('/');
  await expect.poll(() => cardTitles(app.screen)).toEqual(['Wuthering Heights']);

  const search = app.screen.getByRole('searchbox', { name: 'Search books' });
  await userEvent.type(search, 'jane');
  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  expect(continueReading(app.screen).query()).toBeNull();

  await userEvent.clear(search);
  await expect.poll(() => cardTitles(app.screen)).toEqual(['Wuthering Heights']);
});

test('tapping a card opens the reader at the saved position', async () => {
  const started = await startApp(await bronteLibrary());
  const { fake, app } = started;
  await read(started, 3, 'EPUB', 2);
  await read(started, 2, 'PDF', 1);
  app.navigate('/');
  await expect.poll(() => cardTitles(app.screen)).toEqual(['Wuthering Heights', 'Agnes Grey']);

  await userEvent.click(continueReading(app.screen).getByRole('link', { name: /Agnes Grey/ }));

  await expect.element(app.screen.getByRole('heading', { level: 1, name: 'Agnes Grey' })).toBeVisible();
  await expect.element(app.screen.getByText('line 3')).toBeVisible();
  expect(app.url).toBe('/books/3/read/EPUB');
  expect(fake.latest.opened?.location).toBe('3');

  app.navigate('/');
  await userEvent.click(continueReading(app.screen).getByRole('link', { name: /Wuthering Heights/ }));

  await expect.element(app.screen.getByText('page 2 of 3')).toBeVisible();
  expect(app.url).toBe('/books/2/read/PDF');
});

test('Refresh library drops the cards of a book and of a format that are gone', async () => {
  const storage = await bronteLibrary(books.slice(0, 3));
  const started = await startApp(storage);
  const { app } = started;
  for (const bookId of [1, 2, 3]) await read(started, bookId, 'EPUB', 1);
  app.navigate('/');
  await expect.poll(() => cardTitles(app.screen)).toEqual(['Agnes Grey', 'Wuthering Heights', 'Jane Eyre']);

  const [janeEyre, wutheringHeights] = books;
  const changed = await buildCalibreLibrary([janeEyre!, { ...wutheringHeights!, formats: { PDF: pdf } }]);
  storage.put('metadata.db', changed['metadata.db']!, '2');
  await chooseFromMenu(app.screen, 'Refresh library');

  await expect.element(app.screen.getByRole('status')).toHaveTextContent('Library updated');
  await expect.poll(() => cardTitles(app.screen)).toEqual(['Jane Eyre']);
});

test('Disconnect forgets every position but keeps the reader settings', async () => {
  const started = await startApp(await bronteLibrary());
  const { fake, app } = started;
  await read(started, 1, 'EPUB', 2);
  await userEvent.click(app.screen.getByRole('button', { name: 'Settings' }));
  await userEvent.click(app.screen.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Larger text' }));
  await userEvent.keyboard('{Escape}');
  app.navigate('/');
  await expect.poll(() => cardTitles(app.screen)).toEqual(['Jane Eyre']);

  await chooseFromMenu(app.screen, 'Disconnect');
  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
  await userEvent.fill(app.screen.getByRole('textbox', { name: 'MEGA folder link' }), testLink);
  await userEvent.click(app.screen.getByRole('button', { name: 'Connect' }));

  await expect.element(app.screen.getByRole('list', { name: 'Books' })).toBeVisible();
  expect(continueReading(app.screen).query()).toBeNull();

  await read(started, 1, 'EPUB');

  await expect.element(app.screen.getByText('# One')).toBeVisible();
  expect(fake.latest.opened?.location).toBeUndefined();
  expect(fake.latest.calls.find((call) => call.op === 'setStyles')).toEqual({ op: 'setStyles', styles: { fontSize: 110, theme: 'light' } });
});
