import { expect, test } from 'vitest';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { fakeSignInProvider } from './test/fake-sign-in.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

async function library() {
  return new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'] }]));
}

test('the connect screen offers sign-in below the MEGA form, returning to the library picker', async () => {
  const storage = await library();
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }) });

  await expect.element(app.screen.getByRole('form', { name: 'Connect MEGA' })).toBeVisible();
  const signIn = app.screen.getByRole('link', { name: 'Sign in with Fake Drive' });
  await expect.element(signIn).toHaveAttribute('href', '/api/auth/fake/start?return=%2Fconnect%2Ffake');
  expect(signIn.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  expect(app.auth.requests).toEqual([]);
});

test('without sign-in providers the connect screen offers only MEGA', async () => {
  const app = await renderApp({ storage: await library() });

  await expect.element(app.screen.getByRole('form', { name: 'Connect MEGA' })).toBeVisible();
  expect(app.screen.getByRole('link', { name: /Sign in with/ }).elements()).toEqual([]);
});

test.each([
  ['denied', 'Sign-in was cancelled.'],
  ['failed', 'Couldn’t sign in. Try again.'],
])('a sign-in that comes back %s says so on the connect screen', async (outcome, message) => {
  const storage = await library();
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }), path: `/connect/fake#signin-error=${outcome}` });

  await expect.element(app.screen.getByRole('alert')).toHaveTextContent(message);
  await expect.element(app.screen.getByRole('link', { name: 'Sign in with Fake Drive' })).toBeVisible();
  await expect.poll(() => app.url).toBe('/connect/fake');
  expect(app.auth.requests).toEqual([]);
});
