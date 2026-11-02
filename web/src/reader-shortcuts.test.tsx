import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { expectControls, showControls } from './test/reader.ts';
import { renderApp } from './test/render-app.tsx';

const epub = ['# Chapter one', 'line 2', 'line 3', '# Chapter two', 'line 5'].join('\n');
const pdf = ['Page one', 'Page two', 'Page three'].join('\n');

afterEach(async () => {
  await page.viewport(414, 896);
});

async function openReader(path = '/books/1/read/EPUB') {
  const storage = new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub, PDF: pdf } }]),
  );
  const fake = fakeRenderers(['EPUB', 'PDF']);
  const app = await renderApp({ storage, connected: true, path, renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter one').or(app.screen.getByText('Page one'))).toBeVisible();
  return { fake, screen: app.screen };
}

test('Space and Page Down turn to the next page, Shift+Space and Page Up to the previous', async () => {
  const { screen } = await openReader();

  await userEvent.keyboard(' ');
  await expect.element(screen.getByText('line 2')).toBeVisible();
  await userEvent.keyboard('{PageDown}');
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await userEvent.keyboard('{Shift>} {/Shift}');
  await expect.element(screen.getByText('line 2')).toBeVisible();
  await userEvent.keyboard('{PageUp}');
  await expect.element(screen.getByText('# Chapter one')).toBeVisible();
});

test('the page-turn zones declare their keys', async () => {
  const { screen } = await openReader();

  await expect.element(screen.getByRole('button', { name: 'Next page' })).toHaveAttribute('aria-keyshortcuts', 'ArrowRight Space PageDown');
  await expect.element(screen.getByRole('button', { name: 'Previous page' })).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft Shift+Space PageUp');
});

test('Space on a focused control presses the control and does not turn the page', async () => {
  const { fake, screen } = await openReader();
  await showControls(screen);
  const toc = screen.getByRole('button', { name: 'Table of contents' });
  (toc.element() as HTMLElement).focus();

  await userEvent.keyboard(' ');

  await expect.element(screen.getByRole('navigation', { name: 'Table of contents' })).toBeVisible();
  expect(fake.latest.calls.filter(({ op }) => op === 'next')).toEqual([]);
});

test('Space on a focused page-turn zone presses that zone', async () => {
  const { fake, screen } = await openReader();
  await fake.latest.goTo('3');

  (screen.getByRole('button', { name: 'Previous page' }).element() as HTMLElement).focus();
  await userEvent.keyboard(' ');
  await expect.element(screen.getByText('line 2')).toBeVisible();

  (screen.getByRole('button', { name: 'Next page' }).element() as HTMLElement).focus();
  await userEvent.keyboard(' ');
  await expect.element(screen.getByText('line 3')).toBeVisible();
  expect(fake.latest.calls.filter(({ op }) => op === 'next' || op === 'previous')).toEqual([{ op: 'previous' }, { op: 'next' }]);
});

test('with Control, Meta or Alt held, Space and the page keys are left to the browser', async () => {
  const { fake } = await openReader();

  await userEvent.keyboard('{Control>} {PageDown}{/Control}{Meta>} {/Meta}{Alt>}{PageDown}{/Alt}');

  expect(fake.latest.calls.filter(({ op }) => op === 'next')).toEqual([]);
});

test('while the shortcuts are open, the reader keys do nothing', async () => {
  const { fake, screen } = await openReader();

  await userEvent.keyboard('?');
  await expect.element(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await userEvent.keyboard('{ArrowRight}{PageDown}');

  await expect.element(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  expect(fake.latest.calls.filter(({ op }) => op === 'next')).toEqual([]);
  await expectControls(screen, false);
});

test('t opens the table of contents with focus on the current chapter, and t again closes it', async () => {
  const { fake, screen } = await openReader();
  await fake.latest.goTo('4');
  const button = screen.getByRole('button', { name: 'Table of contents' });
  await expect.element(button).toHaveAttribute('aria-keyshortcuts', 'T');

  await userEvent.keyboard('t');

  const toc = screen.getByRole('navigation', { name: 'Table of contents' });
  await expect.element(toc).toBeVisible();
  await expectControls(screen, true);
  await expect.element(toc.getByRole('button', { name: 'Chapter two' })).toHaveFocus();

  await userEvent.keyboard('t');

  await expect.poll(() => toc.query()).toBeNull();
});

test('Esc closes a table of contents opened with t', async () => {
  const { screen } = await openReader();

  await userEvent.keyboard('t');
  await expect.element(screen.getByRole('navigation', { name: 'Table of contents' })).toBeVisible();
  await userEvent.keyboard('{Escape}');

  await expect.poll(() => screen.getByRole('navigation', { name: 'Table of contents' }).query()).toBeNull();
});

test('/ opens search in book with its input focused, without typing the /', async () => {
  const { screen } = await openReader();
  await expect.element(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-keyshortcuts', '/');

  await userEvent.keyboard('/');

  const input = screen.getByRole('searchbox', { name: 'Search in book' });
  await expect.element(input).toHaveFocus();
  await expect.element(input).toHaveValue('');
  await expectControls(screen, true);

  await userEvent.keyboard('a/b');

  await expect.element(input).toHaveValue('a/b');
});

test('/ with search already open moves focus back to its input', async () => {
  const { screen } = await openReader();
  await userEvent.keyboard('/');
  await userEvent.keyboard('line');
  const clear = screen.getByRole('button', { name: 'Clear search' });
  (clear.element() as HTMLElement).focus();

  await userEvent.keyboard('/');

  const input = screen.getByRole('searchbox', { name: 'Search in book' });
  await expect.element(input).toHaveFocus();
  await expect.element(input).toHaveValue('line');
});

test('t does nothing while search is open', async () => {
  const { screen } = await openReader();
  await userEvent.keyboard('/');
  const input = screen.getByRole('searchbox', { name: 'Search in book' });
  await expect.element(input).toHaveFocus();
  (input.element() as HTMLElement).blur();

  await userEvent.keyboard('t');

  await expect.element(input).toBeVisible();
  expect(screen.getByRole('navigation', { name: 'Table of contents' }).query()).toBeNull();
});

test('] goes to the next chapter and [ to the previous one, stopping at the first and last', async () => {
  const { fake, screen } = await openReader();
  await fake.latest.goTo('3');

  await userEvent.keyboard(']');
  await expect.element(screen.getByText('# Chapter two')).toBeVisible();
  await userEvent.keyboard(']');
  await userEvent.keyboard('[[');
  await expect.element(screen.getByText('# Chapter one')).toBeVisible();
  await userEvent.keyboard('[[');

  expect(fake.latest.calls.filter(({ op }) => op === 'goTo')).toEqual([
    { op: 'goTo', location: '3' },
    { op: 'goTo', location: '4' },
    { op: 'goTo', location: '1' },
  ]);
});

test('[ and ] do nothing in a book with no chapters', async () => {
  const { fake } = await openReader('/books/1/read/PDF');

  await userEvent.keyboard('[[]');

  expect(fake.latest.calls.filter(({ op }) => op === 'goTo')).toEqual([]);
});

test('Backspace goes back like the Back to pill, and does nothing when there is no pill', async () => {
  const { fake, screen } = await openReader();
  await userEvent.keyboard('{Backspace}');
  expect(fake.latest.calls.filter(({ op }) => op === 'goTo')).toEqual([]);

  await userEvent.keyboard(']');
  const back = screen.getByRole('button', { name: 'Back to 0%' });
  await expect.element(back).toHaveAttribute('aria-keyshortcuts', 'Backspace');
  await userEvent.keyboard('{Backspace}');

  await expect.element(screen.getByText('# Chapter one')).toBeVisible();
  await expect.poll(() => back.query()).toBeNull();
});

test('n and Shift+n step through the search matches with the search panel closed', async () => {
  const { fake, screen } = await openReader();
  await userEvent.keyboard('n');
  expect(fake.latest.calls.filter(({ op }) => op === 'goTo')).toEqual([]);

  await userEvent.keyboard('/');
  await userEvent.keyboard('line');
  await expect.element(screen.getByText('3 matches')).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await expect.poll(() => screen.getByRole('searchbox', { name: 'Search in book' }).query()).toBeNull();

  await userEvent.keyboard('n');
  await expect.element(screen.getByText('line 2')).toBeVisible();
  await userEvent.keyboard('n');
  await expect.element(screen.getByText('line 3')).toBeVisible();
  await userEvent.keyboard('N');
  await expect.element(screen.getByText('line 2')).toBeVisible();
  await expect.poll(() => fake.latest.calls.filter(({ op }) => op === 'highlight').at(-1)).toEqual({
    op: 'highlight',
    location: '2',
    matches: ['2', '3', '5'],
  });
  await userEvent.keyboard('NN');

  expect(fake.latest.calls.filter(({ op }) => op === 'goTo').map((call) => ('location' in call ? call.location : ''))).toEqual(['2', '3', '2']);
});
