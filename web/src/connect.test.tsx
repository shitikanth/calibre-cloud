import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp, testLink as link } from './test/render-app.tsx';

async function threeBookLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'] },
      { title: 'Wuthering Heights', authors: ['Emily Brontë'] },
      { title: 'A Wizard of Earthsea', authors: ['Ursula K. Le Guin'] },
    ]),
  );
}

afterEach(async () => {
  await page.viewport(414, 896);
});

function connectCard(screen: Awaited<ReturnType<typeof renderApp>>['screen']) {
  return screen.getByRole('region', { name: 'calibre-cloud' });
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

test('a new visitor sees the connect screen', async () => {
  const app = await renderApp({ storage: await threeBookLibrary() });

  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
  expect(app.opened).toEqual([]);
});

test.each([
  ['a link without its key', 'https://mega.nz/folder/TestHandle', /missing its key/],
  ['a file link', 'https://mega.nz/file/TestHandle#TestKey', /isn’t a MEGA folder link/],
])('%s is rejected before any request is made', async (_case, input, message) => {
  const storage = await threeBookLibrary();
  const app = await renderApp({ storage });

  await connect(app.screen, input);

  await expect.element(app.screen.getByRole('alert')).toMatchTextContent(message);
  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toHaveAttribute('aria-invalid', 'true');
  expect(app.opened).toEqual([]);
  expect(storage.calls).toEqual([]);
});

test('the name, tagline and form sit in one card centred on a desktop screen', async () => {
  await page.viewport(1280, 800);
  const app = await renderApp({ storage: await threeBookLibrary() });

  const card = connectCard(app.screen);
  await expect.element(card.getByRole('heading', { level: 1, name: 'calibre-cloud' })).toBeVisible();
  await expect.element(card.getByText(/Browse your Calibre library/)).toBeVisible();
  await expect.element(card.getByRole('form', { name: 'Connect MEGA' })).toBeVisible();

  const rect = card.element().getBoundingClientRect();
  expect(rect.width).toBeLessThan(640);
  expect(Math.abs(rect.left - (1280 - rect.right))).toBeLessThanOrEqual(2);
});

test('the card fills a phone screen with a side gutter and no horizontal scroll', async () => {
  await page.viewport(390, 844);
  const app = await renderApp({ storage: await threeBookLibrary() });

  const card = connectCard(app.screen);
  await expect.element(card.getByRole('button', { name: 'Connect' })).toBeVisible();

  const rect = card.element().getBoundingClientRect();
  expect(rect.left).toBeGreaterThan(0);
  expect(rect.right).toBeLessThan(390);
  expect(rect.width).toBeGreaterThan(300);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});

test('the connection is remembered and the library loads again after a reload', async () => {
  const app = await renderApp({ storage: await threeBookLibrary() });
  await connect(app.screen, link);
  await expect.element(app.screen.getByText('3 books')).toBeVisible();

  const reloaded = await app.reload();

  await expect.element(reloaded.getByText('3 books')).toBeVisible();
  expect(reloaded.getByRole('textbox', { name: 'MEGA folder link' }).query()).toBeNull();
  expect(app.opened).toEqual([
    { provider: 'mega', link },
    { provider: 'mega', link },
  ]);
});

test('a folder without metadata.db at its root shows a wrong-folder message', async () => {
  const app = await renderApp({ storage: new FakeStorage({ 'Some Author/Book (1)/cover.jpg': 'jpeg' }) });

  await connect(app.screen, link);

  await expect.element(app.screen.getByRole('heading', { name: 'Wrong folder' })).toBeVisible();
  await expect.element(app.screen.getByText(/no metadata\.db at its root/)).toBeVisible();
});

test('after a wrong folder the owner can connect a different link', async () => {
  const app = await renderApp({ storage: new FakeStorage() });
  await connect(app.screen, link);

  await userEvent.click(app.screen.getByRole('button', { name: 'Connect a different library' }));

  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
  const reloaded = await app.reload();
  await expect.element(reloaded.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
});
