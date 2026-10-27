import { page, userEvent, type Locator } from 'vitest/browser';
import { afterEach, expect, test, vi } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const epub = ['# Chapter one', 'some text', '# Chapter two', 'more text'].join('\n');

afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(414, 896);
});

async function openReader() {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const storage = new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: epub } }]));
  const fake = fakeRenderers(['EPUB']);
  const app = await renderApp({ storage, connected: true, path: '/books/1/read/EPUB', renderers: fake.renderers });
  await expect.element(app.screen.getByText('# Chapter one')).toBeVisible();
  return { open, fake, app };
}

test('a link out of the book asks first, and Open opens it in a new tab with no opener or referrer', async () => {
  const { open, fake, app } = await openReader();

  fake.latest.emitExternalLink('https://example.com/lighthouse-service');

  const dialog = app.screen.getByRole('dialog', { name: 'Open this link?' });
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByText('https://example.com/lighthouse-service', { exact: true })).toBeVisible();
  expect(open).not.toHaveBeenCalled();

  await userEvent.click(dialog.getByRole('button', { name: 'Open' }));

  expect(open).toHaveBeenCalledExactlyOnceWith('https://example.com/lighthouse-service', '_blank', 'noopener,noreferrer');
  await expect.poll(() => app.screen.getByRole('dialog').query()).toBeNull();
});

const dismissals = [
  { way: 'Cancel', dismiss: (dialog: Locator) => userEvent.click(dialog.getByRole('button', { name: 'Cancel' })) },
  { way: 'Escape', dismiss: () => userEvent.keyboard('{Escape}') },
  { way: 'a tap outside', dismiss: (dialog: Locator) => userEvent.click(dialog, { position: { x: -20, y: -20 } }) },
];

test.each(dismissals)('$way closes the question without opening the link, and the arrow keys turn pages again', async ({ dismiss }) => {
  const { open, fake, app } = await openReader();
  fake.latest.emitExternalLink('https://example.com/lighthouse-service');
  const dialog = app.screen.getByRole('dialog', { name: 'Open this link?' });
  await expect.element(dialog).toBeVisible();

  await userEvent.keyboard('{ArrowRight}');
  expect(fake.latest.calls).not.toContainEqual({ op: 'next' });

  await dismiss(dialog);

  await expect.poll(() => app.screen.getByRole('dialog').query()).toBeNull();
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(app.screen.getByText('some text')).toBeVisible();
  expect(open).not.toHaveBeenCalled();
});

test.each(['javascript:alert(1)', 'data:text/html,%3Cp%3Ecard%3C/p%3E'])('%s is shown as a link that can’t be opened, with only Close', async (url) => {
  const { open, fake, app } = await openReader();

  fake.latest.emitExternalLink(url);

  const dialog = app.screen.getByRole('dialog', { name: 'This link can’t be opened' });
  await expect.element(dialog.getByText(url, { exact: true })).toBeVisible();
  expect(dialog.getByRole('button').elements().map((button) => button.textContent)).toEqual(['Close']);

  await userEvent.click(dialog.getByRole('button', { name: 'Close' }));

  await expect.poll(() => app.screen.getByRole('dialog').query()).toBeNull();
  expect(open).not.toHaveBeenCalled();
});

test('a mailto: link offers Open', async () => {
  const { open, fake, app } = await openReader();

  fake.latest.emitExternalLink('mailto:inspector@example.com');
  await userEvent.click(app.screen.getByRole('dialog', { name: 'Open this link?' }).getByRole('button', { name: 'Open' }));

  expect(open).toHaveBeenCalledExactlyOnceWith('mailto:inspector@example.com', '_blank', 'noopener,noreferrer');
});

test('on a 375 px phone the question fits the screen and a long URL wraps', async () => {
  await page.viewport(375, 667);
  const { fake, app } = await openReader();
  const url = `https://example.com/${'lighthouse-service-'.repeat(12)}end`;

  fake.latest.emitExternalLink(url);

  const dialog = app.screen.getByRole('dialog', { name: 'Open this link?' });
  await expect.element(dialog).toBeVisible();
  const box = dialog.element().getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(375);
  const shown = dialog.getByText(url, { exact: true }).element();
  expect(shown.scrollWidth).toBeLessThanOrEqual(shown.clientWidth);
  expect(shown.getBoundingClientRect().height).toBeGreaterThan(40);
});
