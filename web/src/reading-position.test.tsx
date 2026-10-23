import { userEvent } from 'vitest/browser';
import { expect, onTestFinished, test, vi } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const epub = ['# One', 'line 2', 'line 3', 'line 4', 'line 5'].join('\n');
const pdf = ['Page one', 'Page two', 'Page three'].join('\n');
const epubPath = 'Charlotte Bronte/Jane Eyre (1)/Jane Eyre - Charlotte Bronte.epub';

async function janeEyreLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub, PDF: pdf } }]),
  );
}

async function openReader(storage: FakeStorage, path: string) {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByRole('button', { name: 'Next' })).toBeVisible();
  return { fake, app };
}

test('reopening a book in the same format goes back to the saved page', async () => {
  const { fake, app } = await openReader(await janeEyreLibrary(), '/books/1/read/EPUB');
  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));
  await expect.element(app.screen.getByText('line 3')).toBeVisible();

  const reloaded = await app.reload();

  await expect.element(reloaded.getByText('line 3')).toBeVisible();
  await expect.element(reloaded.getByText('50%')).toBeVisible();
  expect(fake.instances).toHaveLength(2);
  expect(fake.latest.opened?.location).toBe('3');
});

test('a saved location that no longer resolves in the file falls back to the start', async () => {
  const storage = await janeEyreLibrary();
  const { fake, app } = await openReader(storage, '/books/1/read/EPUB');
  for (let page = 0; page < 3; page += 1) await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));
  await expect.element(app.screen.getByText('line 4')).toBeVisible();

  const reloaded = await app.reload({ whileClosed: async () => storage.put(epubPath, '# One\nline 2', '2') });

  await expect.element(reloaded.getByText('# One')).toBeVisible();
  await expect.element(reloaded.getByText('0%')).toBeVisible();
  expect(fake.latest.opened?.location).toBe('4');
});

test('a changed book file keeps the saved position', async () => {
  const storage = await janeEyreLibrary();
  const { fake, app } = await openReader(storage, '/books/1/read/EPUB');
  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));
  await expect.element(app.screen.getByText('line 2')).toBeVisible();

  const reloaded = await app.reload({ whileClosed: async () => storage.put(epubPath, epub.replace('line 2', 'line two'), '2') });

  await expect.element(reloaded.getByText('line two')).toBeVisible();
  expect(fake.latest.opened?.location).toBe('2');
});

test('opening the same book in its other format starts from the beginning of that format', async () => {
  const { fake, app } = await openReader(await janeEyreLibrary(), '/books/1/read/EPUB');
  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));
  await expect.element(app.screen.getByText('line 3')).toBeVisible();

  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));
  await userEvent.click(app.screen.getByRole('link', { name: 'Read PDF' }));

  await expect.element(app.screen.getByText('page 1 of 3')).toBeVisible();
  expect(fake.latest.opened?.location).toBeUndefined();
  await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));

  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));
  await userEvent.click(app.screen.getByRole('link', { name: 'Read EPUB' }));

  await expect.element(app.screen.getByText('line 3')).toBeVisible();
  expect(fake.latest.opened?.location).toBe('3');

  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));
  await userEvent.click(app.screen.getByRole('link', { name: 'Read PDF' }));

  await expect.element(app.screen.getByText('page 2 of 3')).toBeVisible();
});

test('a burst of page turns is written once at once and once more about a second later, and a reload loses none of it', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  onTestFinished(() => setItem.mockRestore());
  const positionWrites = () => setItem.mock.calls.filter(([key]) => key === 'calibre-cloud:positions').length;
  const { fake, app } = await openReader(await janeEyreLibrary(), '/books/1/read/EPUB');
  await expect.poll(positionWrites).toBe(1);

  for (let page = 0; page < 3; page += 1) await userEvent.click(app.screen.getByRole('button', { name: 'Next' }));

  await expect.element(app.screen.getByText('line 4')).toBeVisible();
  expect(positionWrites()).toBeLessThan(4);
  await expect.poll(positionWrites).toBe(2);
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  expect(positionWrites()).toBe(2);

  const reloaded = await app.reload();

  await expect.element(reloaded.getByText('line 4')).toBeVisible();
  expect(fake.latest.opened?.location).toBe('4');
});
