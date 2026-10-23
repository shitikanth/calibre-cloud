import { userEvent } from 'vitest/browser';
import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers, type FakeRenderer } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

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
