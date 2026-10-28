import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Network } from './storage/adapter.ts';
import { buildCalibreLibrary } from './test/calibre-library.ts';
import { FakeAuthServer } from './test/fake-auth.ts';
import { fakeSignInProvider, type FakeSignInOptions } from './test/fake-sign-in.ts';
import { FakeStorage } from './test/fake-storage.ts';
import { renderApp } from './test/render-app.tsx';

async function library() {
  return new FakeStorage(await buildCalibreLibrary([{ title: 'Jane Eyre', authors: ['Charlotte Brontë'] }]));
}

async function openPicker(options: Omit<FakeSignInOptions, 'storage'> & { storage?: FakeStorage; auth?: FakeAuthServer } = {}) {
  const storage = options.storage ?? (await library());
  const drive = fakeSignInProvider({ ...options, storage });
  const app = await renderApp({ storage, signIn: drive, path: '/connect/fake', ...(options.auth && { auth: options.auth }) });
  return { app, drive, storage };
}

const picker = (app: Awaited<ReturnType<typeof renderApp>>) => app.screen.getByRole('region', { name: 'Choose your library' });

test('the picker lists every library the search found, and one click opens it', async () => {
  const { app } = await openPicker({
    libraries: [
      { root: 'root-1', path: 'My Drive/Calibre Library' },
      { root: 'root-2', path: 'Shared with me/Books' },
    ],
  });

  await expect.element(picker(app).getByRole('button', { name: 'My Drive/Calibre Library' })).toBeVisible();
  await userEvent.click(picker(app).getByRole('button', { name: 'Shared with me/Books' }));

  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  expect(app.url).toBe('/');
  expect(new Set(app.opened)).toEqual(new Set([{ provider: 'fake', root: 'root-2' }]));
});

test('a single library found is still shown, and nothing opens until it is clicked', async () => {
  const { app, storage } = await openPicker({ libraries: [{ root: 'root-1', path: 'My Drive/Calibre Library' }] });

  const only = picker(app).getByRole('button', { name: 'My Drive/Calibre Library' });
  await expect.element(only).toBeVisible();
  expect(only.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  expect(app.opened).toEqual([]);
  expect(storage.calls).toEqual([]);
  expect(app.url).toBe('/connect/fake');
});

test('the picker says it is searching until the search finishes', async () => {
  const storage = await library();
  const drive = fakeSignInProvider({ storage, libraries: [{ root: 'root-1', path: 'Calibre Library' }] });
  const held = drive.holdNextSearch();
  const app = await renderApp({ storage, signIn: drive, path: '/connect/fake' });

  await held.started;
  await expect.element(picker(app).getByRole('status')).toHaveTextContent('Searching for Calibre libraries…');
  held.release();
  await expect.element(picker(app).getByRole('button', { name: 'Calibre Library' })).toBeVisible();
});

test('when the search finds nothing, the picker suggests browsing', async () => {
  const { app } = await openPicker();

  await expect.element(picker(app).getByText('No Calibre library found. Browse your folders instead.')).toBeVisible();
  await expect.element(picker(app).getByRole('button', { name: 'Browse folders' })).toBeVisible();
});

test('browsing folders reaches a library the search missed', async () => {
  const { app, drive } = await openPicker({
    libraries: [{ root: 'other', path: 'Old Library' }],
    folders: [
      { id: 'documents', name: 'Documents', folders: [{ id: 'calibre', name: 'Calibre' }] },
      { id: 'photos', name: 'Photos' },
    ],
  });

  await userEvent.click(picker(app).getByRole('button', { name: 'Browse folders' }));
  await expect.element(picker(app).getByRole('button', { name: 'Photos' })).toBeVisible();
  expect(picker(app).getByRole('button', { name: 'Use this folder' }).elements()).toEqual([]);

  await userEvent.click(picker(app).getByRole('button', { name: 'Documents' }));
  await expect.element(picker(app).getByRole('heading', { name: 'Documents' })).toBeVisible();
  await userEvent.click(picker(app).getByRole('button', { name: 'Up' }));
  await expect.element(picker(app).getByRole('button', { name: 'Photos' })).toBeVisible();

  await userEvent.click(picker(app).getByRole('button', { name: 'Documents' }));
  await userEvent.click(picker(app).getByRole('button', { name: 'Calibre' }));
  await expect.element(picker(app).getByRole('heading', { name: 'Calibre' })).toBeVisible();
  await userEvent.click(picker(app).getByRole('button', { name: 'Use this folder' }));

  await expect.element(app.screen.getByRole('heading', { level: 2, name: 'Jane Eyre' })).toBeVisible();
  expect(new Set(app.opened)).toEqual(new Set([{ provider: 'fake', root: 'calibre' }]));
  expect(drive.finderCalls).toEqual(
    expect.arrayContaining(['listFolder (top)', 'listFolder documents', 'listFolder calibre']),
  );
});

test('picking a folder with no Calibre library says so and stays in the picker', async () => {
  const { app } = await openPicker({
    storage: new FakeStorage(),
    libraries: [{ root: 'photos', path: 'My Drive/Photos' }],
  });

  await userEvent.click(picker(app).getByRole('button', { name: 'My Drive/Photos' }));

  await expect.element(picker(app).getByRole('alert')).toMatchTextContent(/This folder has no Calibre library/);
  await expect.element(picker(app).getByRole('button', { name: 'My Drive/Photos' })).toBeEnabled();
  expect(app.url).toBe('/connect/fake');
  await userEvent.click(picker(app).getByRole('button', { name: 'Browse folders' }));
  expect(picker(app).getByRole('alert').query()).toBeNull();
  const reloaded = await app.reload();
  await expect.element(reloaded.getByRole('region', { name: 'Choose your library' })).toBeVisible();
});

test('an ended sign-in offers to sign in again and come back to the picker', async () => {
  const auth = new FakeAuthServer();
  auth.refreshOutcome = 'reconnect';
  const { app } = await openPicker({ auth });

  await expect.element(picker(app).getByRole('alert')).toMatchTextContent(/Reconnect your library/);
  await expect
    .element(picker(app).getByRole('link', { name: 'Sign in again' }))
    .toHaveAttribute('href', '/api/auth/fake/start?return=%2Fconnect%2Ffake');
});

test('a search that cannot reach the provider can be tried again', async () => {
  const storage = await library();
  const drive = fakeSignInProvider({ storage, libraries: [{ root: 'root-1', path: 'Calibre Library' }] });
  drive.failFindingWith(new Network('offline'));
  const app = await renderApp({ storage, signIn: drive, path: '/connect/fake' });

  await expect.element(picker(app).getByRole('alert')).toMatchTextContent(/Couldn’t reach your library/);
  drive.failFindingWith(undefined);
  await userEvent.click(picker(app).getByRole('button', { name: 'Try again' }));

  await expect.element(picker(app).getByRole('button', { name: 'Calibre Library' })).toBeVisible();
});

test('Cancel goes back to the connect screen', async () => {
  const { app } = await openPicker({ libraries: [{ root: 'root-1', path: 'Calibre Library' }] });

  await userEvent.click(picker(app).getByRole('link', { name: 'Cancel' }));

  await expect.element(app.screen.getByRole('form', { name: 'Connect MEGA' })).toBeVisible();
  expect(app.url).toBe('/');
  expect(app.opened).toEqual([]);
});

test('Cancel while a library is opening does not connect it', async () => {
  const storage = await library();
  const held = storage.holdNextStat('metadata.db');
  const { app } = await openPicker({ storage, libraries: [{ root: 'root-1', path: 'Calibre Library' }] });

  await userEvent.click(picker(app).getByRole('button', { name: 'Calibre Library' }));
  await held.started;
  await userEvent.click(picker(app).getByRole('link', { name: 'Cancel' }));
  held.release();

  await expect.element(app.screen.getByRole('form', { name: 'Connect MEGA' })).toBeVisible();
  const reloaded = await app.reload();
  await expect.element(reloaded.getByRole('form', { name: 'Connect MEGA' })).toBeVisible();
});

test('a sign-in problem is not shown again after moving to another page', async () => {
  const storage = await library();
  const app = await renderApp({
    storage,
    signIn: fakeSignInProvider({ storage, libraries: [{ root: 'root-1', path: 'Calibre Library' }] }),
    path: '/connect/fake#signin-error=denied',
  });
  await expect.element(app.screen.getByText('Sign-in was cancelled.')).toBeVisible();

  app.navigate('/');
  await expect.element(app.screen.getByRole('form', { name: 'Connect MEGA' })).toBeVisible();
  expect(app.screen.getByText('Sign-in was cancelled.').query()).toBeNull();
  app.navigate('/connect/fake');
  await expect.element(picker(app).getByRole('button', { name: 'Calibre Library' })).toBeVisible();
});
