import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { chooseFromMenu } from './test/app-bar.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers, type FakeRenderer } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp, testLink } from './test/render-app.tsx';
import type { Screen } from './test/screen.ts';

const epub = ['# Chapter one', 'some text', '# Chapter two', 'more text'].join('\n');

async function janeEyreLibrary() {
  return new FakeStorage(
    await buildCalibreLibrary([
      { title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub, PDF: 'Page one\nPage two' } },
    ]),
  );
}

async function openReader(path: string) {
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const storage = await janeEyreLibrary();
  const app = await renderApp({ storage, connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByRole('button', { name: 'Settings' })).toBeVisible();
  return { fake, app, storage };
}

function styleCalls(renderer: FakeRenderer) {
  return renderer.calls.flatMap((call) => (call.op === 'setStyles' ? [call.styles] : []));
}

function zoomCalls(renderer: FakeRenderer) {
  return renderer.calls.flatMap((call) => (call.op === 'setZoom' ? [call.zoom] : []));
}

async function openSettings(screen: Screen) {
  await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
  const settings = screen.getByRole('dialog', { name: 'Settings' });
  await expect.element(settings).toBeVisible();
  return settings;
}

function readerRoot(screen: Screen) {
  return screen.container.querySelector<HTMLElement>('[data-theme]');
}

test('Larger and Smaller text step the font size and tell the renderer', async () => {
  const { fake, app } = await openReader('/books/1/read/EPUB');

  await userEvent.click(app.screen.getByRole('button', { name: 'Settings' }));
  const settings = app.screen.getByRole('dialog', { name: 'Settings' });
  await expect.element(settings).toMatchTextContent(/100%/);

  await userEvent.click(settings.getByRole('button', { name: 'Larger text' }));

  await expect.element(settings).toMatchTextContent(/110%/);
  expect(styleCalls(fake.latest).at(-1)).toEqual({ fontSize: 110, theme: 'light' });

  await userEvent.click(settings.getByRole('button', { name: 'Smaller text' }));
  await userEvent.click(settings.getByRole('button', { name: 'Smaller text' }));

  await expect.element(settings).toMatchTextContent(/90%/);
  expect(styleCalls(fake.latest).at(-1)).toEqual({ fontSize: 90, theme: 'light' });
});

test('the book opens with the default text size and theme', async () => {
  const { fake } = await openReader('/books/1/read/EPUB');

  expect(styleCalls(fake.latest)).toEqual([{ fontSize: 100, theme: 'light' }]);
});

test('choosing Dark themes the book and the reader screen, and nothing outside it', async () => {
  const { fake, app } = await openReader('/books/1/read/EPUB');
  expect(readerRoot(app.screen)).toHaveAttribute('data-theme', 'light');
  const lightBackground = getComputedStyle(readerRoot(app.screen)!).backgroundColor;

  const settings = await openSettings(app.screen);
  await userEvent.click(settings.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }));

  expect(styleCalls(fake.latest).at(-1)).toEqual({ fontSize: 100, theme: 'dark' });
  await expect.element(settings.getByRole('radio', { name: 'Dark' })).toBeChecked();
  const root = readerRoot(app.screen)!;
  expect(root).toHaveAttribute('data-theme', 'dark');
  expect(getComputedStyle(root).backgroundColor).toBe('rgb(18, 18, 18)');
  expect(getComputedStyle(root).backgroundColor).not.toBe(lightBackground);
  expect(getComputedStyle(document.body).backgroundColor).not.toBe('rgb(18, 18, 18)');

  await userEvent.keyboard('{Escape}');
  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));
  await expect.element(app.screen.getByRole('button', { name: 'Download EPUB' })).toBeVisible();
  expect(document.querySelector('[data-theme]')).toBeNull();
});

test('text size and theme survive a reload and reach the next book opened', async () => {
  const { fake, app } = await openReader('/books/1/read/EPUB');
  const settings = await openSettings(app.screen);
  await userEvent.click(settings.getByRole('button', { name: 'Larger text' }));
  await userEvent.click(settings.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }));

  const reloaded = await app.reload();

  await expect.element(reloaded.getByRole('button', { name: 'Settings' })).toBeVisible();
  expect(fake.instances).toHaveLength(2);
  expect(styleCalls(fake.latest)).toEqual([{ fontSize: 110, theme: 'dark' }]);
  expect(readerRoot(reloaded)).toHaveAttribute('data-theme', 'dark');
  await expect.element(await openSettings(reloaded)).toMatchTextContent(/110%/);
});

test('Disconnect keeps the reader settings', async () => {
  const { fake, app } = await openReader('/books/1/read/EPUB');
  const settings = await openSettings(app.screen);
  await userEvent.click(settings.getByRole('button', { name: 'Larger text' }));
  await userEvent.click(settings.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Sepia' }));
  await userEvent.keyboard('{Escape}');
  await userEvent.click(app.screen.getByRole('link', { name: 'Back to book' }));
  await expect.element(app.screen.getByRole('button', { name: 'Download EPUB' })).toBeVisible();

  await chooseFromMenu(app.screen, 'Disconnect');
  await expect.element(app.screen.getByRole('textbox', { name: 'MEGA folder link' })).toBeVisible();
  await userEvent.fill(app.screen.getByRole('textbox', { name: 'MEGA folder link' }), testLink);
  await userEvent.click(app.screen.getByRole('button', { name: 'Connect' }));
  await userEvent.click(app.screen.getByRole('link', { name: 'Read EPUB' }));

  await expect.element(app.screen.getByRole('button', { name: 'Settings' })).toBeVisible();
  expect(fake.instances).toHaveLength(2);
  expect(styleCalls(fake.latest)).toEqual([{ fontSize: 110, theme: 'sepia' }]);
});

test('unreadable saved settings fall back to the defaults', async () => {
  localStorage.setItem('calibre-cloud:reader-settings', '{"fontSize":"huge"');
  const { fake } = await openReader('/books/1/read/EPUB');

  expect(styleCalls(fake.latest)).toEqual([{ fontSize: 100, theme: 'light' }]);
});

test('Zoom in and out step the zoom for the open book only; a reload starts at fit-width again', async () => {
  const { fake, app } = await openReader('/books/1/read/PDF');
  const settings = await openSettings(app.screen);
  await expect.element(settings).toMatchTextContent(/Zoom.*100%/);

  await userEvent.click(settings.getByRole('button', { name: 'Zoom in' }));
  await expect.element(settings).toMatchTextContent(/125%/);
  expect(zoomCalls(fake.latest)).toEqual([1.25]);

  await userEvent.click(settings.getByRole('button', { name: 'Zoom out' }));
  await userEvent.click(settings.getByRole('button', { name: 'Zoom out' }));
  await expect.element(settings).toMatchTextContent(/80%/);
  expect(zoomCalls(fake.latest).at(-1)).toBeCloseTo(0.8);

  const reloaded = await app.reload();
  await expect.element(reloaded.getByRole('button', { name: 'Settings' })).toBeVisible();
  expect(zoomCalls(fake.latest).filter((zoom) => zoom !== 1)).toEqual([]);
  await expect.element(await openSettings(reloaded)).toMatchTextContent(/100%/);
});

test('zoom stops at its bounds', async () => {
  const { app } = await openReader('/books/1/read/PDF');
  const settings = await openSettings(app.screen);
  const zoomIn = settings.getByRole('button', { name: 'Zoom in' });

  for (let step = 0; step < 7; step += 1) await userEvent.click(zoomIn);

  await expect.element(settings).toMatchTextContent(/477%/);
  await expect.element(zoomIn).toBeDisabled();
  await expect.element(settings.getByRole('button', { name: 'Zoom out' })).toBeEnabled();
});
