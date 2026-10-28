import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { chooseScreen, connectMega, openMegaStep } from './test/connect.ts';
import { fakeSignInProvider } from './test/fake-sign-in.ts';
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

type Screen = Awaited<ReturnType<typeof renderApp>>['screen'];

function pageColourAt(x: number, y: number) {
  const painted = document
    .elementsFromPoint(x, y)
    .map((element) => getComputedStyle(element).backgroundColor)
    .find((colour) => colour !== 'rgba(0, 0, 0, 0)');
  return painted ?? 'white';
}

function megaStep(screen: Screen) {
  return screen.getByRole('region', { name: 'MEGA' });
}

test('connecting a MEGA folder link shows the library', async () => {
  const app = await renderApp({ storage: await threeBookLibrary() });

  await connectMega(app.screen, link);

  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  expect(app.opened).toEqual([{ provider: 'mega', link }]);
  expect(app.url).toBe('/');
});

test('a new visitor chooses from every storage provider, in the registry’s order', async () => {
  const storage = await threeBookLibrary();
  const signIn = fakeSignInProvider({ storage });
  const app = await renderApp({ storage, signIn });

  const screen = chooseScreen(app.screen);
  await expect.element(screen.getByRole('heading', { level: 1, name: 'Connect your Calibre library' })).toBeVisible();
  await expect.element(screen.getByText(/^Read-only\. calibre-cloud never changes your library/)).toBeVisible();
  const tiles = screen.getByRole('listitem').getByRole('link');
  expect(tiles.elements()).toEqual([
    screen.getByRole('link', { name: 'MEGA' }).element(),
    screen.getByRole('link', { name: 'Fake Drive' }).element(),
  ]);
  for (const tile of tiles.elements()) {
    const icon = tile.querySelector('img')!;
    await expect.poll(() => icon.complete && icon.naturalWidth > 0).toBe(true);
    expect(icon.alt).toBe('');
    expect(icon.getBoundingClientRect()).toMatchObject({ width: 48, height: 48 });
    expect(tile.getBoundingClientRect().height).toBeGreaterThanOrEqual(120);
  }
  expect(tiles.elements()[1]!.querySelector('img')!.getAttribute('src')).toBe(signIn.icon);
  expect(app.opened).toEqual([]);
});

test('a tile shows a focus ring when reached by keyboard', async () => {
  const app = await renderApp({ storage: await threeBookLibrary() });
  const tile = chooseScreen(app.screen).getByRole('link', { name: 'MEGA' });
  await expect.element(tile).toBeVisible();

  await userEvent.tab();

  await expect.element(tile).toHaveFocus();
  expect(getComputedStyle(tile.element()).outlineStyle).toBe('solid');
});

test('the MEGA tile opens MEGA’s step, and All storage goes back to the choice', async () => {
  const app = await renderApp({ storage: await threeBookLibrary() });

  await openMegaStep(app.screen);

  const step = megaStep(app.screen);
  await expect.element(step.getByRole('heading', { level: 1, name: 'MEGA' })).toBeVisible();
  await expect.element(step.getByText('Paste the shared link to your Calibre library folder.')).toBeVisible();
  await expect.element(step.getByRole('textbox', { name: 'MEGA folder link' })).toHaveValue('');
  expect(app.url).toBe('/connect/mega');
  const back = step.getByRole('link', { name: 'All storage' });
  expect(back.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

  await userEvent.click(back);

  await expect.element(chooseScreen(app.screen).getByRole('link', { name: 'MEGA' })).toBeVisible();
  expect(app.url).toBe('/');
});

test('the browser’s Back and Forward move between the choice and MEGA’s step', async () => {
  const app = await renderApp({ storage: await threeBookLibrary() });
  await openMegaStep(app.screen);

  app.back();
  await expect.element(chooseScreen(app.screen)).toBeVisible();
  app.forward();

  await expect.element(megaStep(app.screen).getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
});

test('connecting from a book page lands on the library', async () => {
  const app = await renderApp({ storage: await threeBookLibrary(), path: '/books/1' });

  await connectMega(app.screen, link);

  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  expect(app.url).toBe('/');
});

test.each([
  ['a link without its key', 'https://mega.nz/folder/TestHandle', /missing its key/],
  ['a file link', 'https://mega.nz/file/TestHandle#TestKey', /isn’t a MEGA folder link/],
])('%s is rejected before any request is made', async (_case, input, message) => {
  const storage = await threeBookLibrary();
  const app = await renderApp({ storage });

  await connectMega(app.screen, input);

  await expect.element(app.screen.getByRole('alert')).toMatchTextContent(message);
  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toHaveAttribute('aria-invalid', 'true');
  expect(app.opened).toEqual([]);
  expect(storage.calls).toEqual([]);
});

test('on a desktop screen the choice sits in one bordered card, centred on a grey page', async () => {
  await page.viewport(1280, 800);
  const app = await renderApp({ storage: await threeBookLibrary() });

  const card = chooseScreen(app.screen);
  await expect.element(card.getByRole('link', { name: 'MEGA' })).toBeVisible();

  const rect = card.element().getBoundingClientRect();
  expect(rect.width).toBe(448);
  expect(Math.abs(rect.left - (1280 - rect.right))).toBeLessThanOrEqual(2);
  expect(getComputedStyle(card.element()).borderTopWidth).toBe('1px');
  expect(pageColourAt(40, 400)).toBe('oklch(0.985 0 none)');
});

test.each([
  ['the choice', async () => undefined],
  ['MEGA’s step', openMegaStep],
])('on a phone %s runs edge to edge on white, with no horizontal scroll', async (_case, open) => {
  await page.viewport(390, 844);
  const app = await renderApp({ storage: await threeBookLibrary() });
  await expect.element(chooseScreen(app.screen)).toBeVisible();
  await open(app.screen);

  const panel = app.screen.getByRole('region').element();
  expect(getComputedStyle(panel).borderTopWidth).toBe('0px');
  const heading = app.screen.getByRole('heading', { level: 1 }).element().getBoundingClientRect();
  expect(heading.left).toBe(24);
  expect(pageColourAt(5, 800)).toBe('white');
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});

test('MEGA’s Connect button fills the width of the step', async () => {
  await page.viewport(390, 844);
  const app = await renderApp({ storage: await threeBookLibrary() });
  const input = await openMegaStep(app.screen);
  await expect.element(input).toBeVisible();

  const button = app.screen.getByRole('button', { name: 'Connect' }).element().getBoundingClientRect();
  expect(button).toMatchObject({ left: 24, right: 366 });
  expect(button.height).toBeGreaterThanOrEqual(44);
});

test('the connection is remembered and the library loads again after a reload', async () => {
  const app = await renderApp({ storage: await threeBookLibrary() });
  await connectMega(app.screen, link);
  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();

  const reloaded = await app.reload();

  await expect.element(reloaded.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  expect(chooseScreen(reloaded).query()).toBeNull();
  expect(app.opened).toEqual([
    { provider: 'mega', link },
    { provider: 'mega', link },
  ]);
});

test('a folder without metadata.db at its root shows a wrong-folder message', async () => {
  const app = await renderApp({ storage: new FakeStorage({ 'Some Author/Book (1)/cover.jpg': 'jpeg' }) });

  await connectMega(app.screen, link);

  await expect.element(app.screen.getByRole('heading', { name: 'Wrong folder' })).toBeVisible();
  await expect.element(app.screen.getByText(/no metadata\.db at its root/)).toBeVisible();
});

test('after a wrong folder the owner can connect a different library', async () => {
  const app = await renderApp({ storage: new FakeStorage() });
  await connectMega(app.screen, link);

  await userEvent.click(app.screen.getByRole('button', { name: 'Connect a different library' }));

  await expect.element(chooseScreen(app.screen)).toBeVisible();
  const reloaded = await app.reload();
  await expect.element(chooseScreen(reloaded)).toBeVisible();
});
