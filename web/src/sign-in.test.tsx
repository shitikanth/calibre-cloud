import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { ReconnectRequired } from './storage/adapter.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeAuthServer } from './test/fake-auth.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { fakeSignInProvider } from './test/fake-sign-in.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

const epubPath = 'Charlotte Bronte/Jane Eyre (1)/Jane Eyre - Charlotte Bronte.epub';
const signedIn = { provider: 'fake', root: 'root-1' };

async function library() {
  return new FakeStorage(
    await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'], formats: { EPUB: 'epub' } }]),
  );
}

function endedSignIn() {
  const auth = new FakeAuthServer();
  auth.refreshOutcome = 'reconnect';
  return auth;
}

function reconnectHref(returnTo: string) {
  return `/api/auth/fake/start?${new URLSearchParams({ return: returnTo })}`;
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

test('a library that cannot load because the sign-in ended offers Reconnect back to the same page', async () => {
  const storage = await library();
  const app = await renderApp({
    storage,
    signIn: fakeSignInProvider({ storage }),
    connected: signedIn,
    auth: endedSignIn(),
    path: '/?q=eyre',
  });

  const alert = app.screen.getByRole('alert');
  await expect.element(alert).toMatchTextContent(/Reconnect your library/);
  const reconnect = alert.getByRole('link', { name: 'Reconnect' });
  await expect.element(reconnect).toHaveAttribute('href', reconnectHref('/?q=eyre'));
  expect(reconnect.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});

test('a book that cannot open because the sign-in ended offers Reconnect back to the reader', async () => {
  const storage = await library();
  storage.failWith(epubPath, new ReconnectRequired());
  const app = await renderApp({
    storage,
    signIn: fakeSignInProvider({ storage }),
    connected: signedIn,
    path: '/books/1/read/EPUB',
    renderers: fakeRenderers(['EPUB']).renderers,
  });

  const alert = app.screen.getByRole('alert');
  await expect.element(alert.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', reconnectHref('/books/1/read/EPUB'));
  await expect.element(alert.getByRole('link', { name: 'Back to book' })).toBeVisible();
});

test('a download that fails because the sign-in ended offers Reconnect back to the book', async () => {
  const storage = await library();
  storage.failWith(epubPath, new ReconnectRequired());
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }), connected: signedIn, path: '/books/1' });

  await userEvent.click(app.screen.getByRole('button', { name: 'Download EPUB' }));

  const alert = app.screen.getByRole('alert');
  await expect.element(alert.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', reconnectHref('/books/1'));
});

test('a cached library whose sign-in ended stays browsable with Reconnect in the banner', async () => {
  const storage = await library();
  const auth = new FakeAuthServer();
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }), connected: signedIn, auth });
  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  auth.refreshOutcome = 'reconnect';

  const reloaded = await app.reload();

  const alert = reloaded.getByRole('alert');
  await expect.element(alert.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', reconnectHref('/'));
  await expect.element(reloaded.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
});

test('a Reconnect that comes back failed says so beside Reconnect', async () => {
  const storage = await library();
  const app = await renderApp({
    storage,
    signIn: fakeSignInProvider({ storage }),
    connected: signedIn,
    auth: endedSignIn(),
    path: '/books/1#signin-error=denied',
  });

  await expect.element(app.screen.getByText('Sign-in was cancelled.')).toBeVisible();
  await expect.element(app.screen.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', reconnectHref('/books/1'));
  await expect.poll(() => app.url).toBe('/books/1');
});

test('a MEGA library that needs reconnecting still offers only a different library', async () => {
  const storage = await library();
  storage.failWith('metadata.db', new ReconnectRequired());
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }), connected: true });

  await expect.element(app.screen.getByRole('heading', { name: 'Reconnect your library' })).toBeVisible();
  await expect.element(app.screen.getByRole('button', { name: 'Connect a different library' })).toBeVisible();
  expect(app.screen.getByRole('link', { name: 'Reconnect' }).query()).toBeNull();
});
