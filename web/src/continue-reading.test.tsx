import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { buildCalibreLibrary, type BookSpec } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';
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
