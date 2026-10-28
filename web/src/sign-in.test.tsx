import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { ReconnectRequired } from './storage/adapter.ts';
import { chooseFromMenu } from './test/app-bar.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { chooseScreen } from './test/connect.ts';
import { FakeAuthServer } from './test/fake-auth.ts';
import { fakeRenderers } from './test/fake-renderer.ts';
import { fakeSignInProvider } from './test/fake-sign-in.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';
import type { Screen } from './test/screen.ts';

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

function signInTile(screen: Screen) {
  return chooseScreen(screen).getByRole('link', { name: 'Fake Drive' });
}

test('a sign-in provider’s tile starts its sign-in, returning to the library picker', async () => {
  const storage = await library();
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }) });

  await expect.element(signInTile(app.screen)).toHaveAttribute('href', '/api/auth/fake/start?return=%2Fconnect%2Ffake');
  expect(app.auth.requests).toEqual([]);
});

test('without sign-in providers the connect screen offers only MEGA', async () => {
  const app = await renderApp({ storage: await library() });

  await expect.element(chooseScreen(app.screen).getByRole('link', { name: 'MEGA' })).toBeVisible();
  expect(chooseScreen(app.screen).getByRole('link').elements().map((tile) => tile.textContent)).toEqual(['MEGA']);
});

test.each([
  ['denied', 'Sign-in was cancelled.'],
  ['failed', 'Couldn’t sign in. Try again.'],
])('a sign-in that comes back %s says so on the connect screen', async (outcome, message) => {
  const storage = await library();
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }), path: `/connect/fake#signin-error=${outcome}` });

  await expect.element(chooseScreen(app.screen).getByRole('alert')).toHaveTextContent(message);
  await expect.element(signInTile(app.screen)).toBeVisible();
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

test('Disconnect ends the sign-in and forgets the library on this device', async () => {
  const storage = await library();
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }), connected: signedIn });
  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();

  await chooseFromMenu(app.screen, 'Disconnect');

  await expect.element(signInTile(app.screen)).toBeVisible();
  expect(app.auth.requests).toEqual(['POST /api/auth/refresh', 'POST /api/auth/signout']);
  app.navigate('/connect/fake');
  await expect.element(app.screen.getByText('No Calibre library found. Browse your folders instead.')).toBeVisible();
  expect(app.auth.requests.at(-1)).toBe('POST /api/auth/refresh');
  const reloaded = await app.reload({ whileClosed: async () => app.navigate('/') });
  await expect.element(signInTile(reloaded)).toBeVisible();
});

test('a sign-out that fails still forgets the library on this device', async () => {
  const storage = await library();
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }), connected: signedIn });
  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  app.auth.signOutFails = true;

  await chooseFromMenu(app.screen, 'Disconnect');

  await expect.element(signInTile(app.screen)).toBeVisible();
  const reloaded = await app.reload();
  await expect.element(signInTile(reloaded)).toBeVisible();
});

test('a MEGA Disconnect does not touch the sign-in', async () => {
  const storage = await library();
  const app = await renderApp({ storage, signIn: fakeSignInProvider({ storage }), connected: true });
  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();

  await chooseFromMenu(app.screen, 'Disconnect');

  await expect.element(chooseScreen(app.screen)).toBeVisible();
  expect(app.auth.requests).toEqual([]);
});
