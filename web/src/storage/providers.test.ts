import { describe, expect, test } from 'vitest';
import { FakeAuthServer } from '../test/fake-auth.ts';
import { fakeSignInProvider } from '../test/fake-sign-in.ts';
import { FakeStorage } from '../test/fake-storage.ts';
import { createAccessTokens } from './access-tokens.ts';
import { createProviders, providers } from './providers.ts';

const megaConnection = { provider: 'mega', link: 'https://mega.nz/folder/abcdefgh#0123456789abcdefghijkl' };
const driveConnection = { provider: 'fake', root: 'folder-1' };

function setup() {
  const auth = new FakeAuthServer();
  const storage = new FakeStorage({ 'metadata.db': 'db' });
  const drive = fakeSignInProvider({ storage });
  const registry = createProviders([...providers.filter(({ kind }) => kind === 'link'), drive], createAccessTokens({ fetch: auth.fetch }));
  return { auth, storage, drive, registry };
}

test('the app offers MEGA and Google Drive', () => {
  expect(providers.map(({ id }) => id)).toEqual(['mega', 'google']);
});

test('lists every provider in the order given, whatever its kind', () => {
  const drive = fakeSignInProvider({ storage: new FakeStorage() });
  const registry = createProviders([drive, ...providers.filter(({ kind }) => kind === 'link')], createAccessTokens());

  expect(registry.allProviders.map(({ id }) => id)).toEqual(['fake', 'mega']);
});

describe('readConnection', () => {
  test('accepts a stored MEGA connection', () => {
    const { registry } = setup();
    expect(registry.readConnection(megaConnection)).toBe(megaConnection);
  });

  test('accepts a stored sign-in connection', () => {
    const { registry } = setup();
    expect(registry.readConnection(driveConnection)).toBe(driveConnection);
  });

  test.each([
    ['nothing stored', null],
    ['a bare link', megaConnection.link],
    ['an object with no provider', { link: megaConnection.link }],
    ['a provider nobody implements', { provider: 'dropbox', path: '/Calibre Library' }],
    ['a MEGA connection missing its link', { provider: 'mega' }],
    ['a sign-in connection missing its root', { provider: 'fake' }],
  ])('rejects %s', (_case, value) => {
    const { registry } = setup();
    expect(registry.readConnection(value)).toBeUndefined();
  });
});

describe('openStorage', () => {
  test('opens a MEGA connection as a storage adapter', () => {
    const { registry } = setup();
    expect(registry.openStorage(megaConnection)).toMatchObject({ stat: expect.any(Function), read: expect.any(Function) });
  });

  test('opens a sign-in connection with access tokens from the sign-in', async () => {
    const { auth, registry } = setup();

    await expect(registry.openStorage(driveConnection).stat('metadata.db')).resolves.toEqual({ size: 2, version: '1' });
    expect(auth.requests).toEqual(['POST /api/auth/refresh']);
  });

  test('refuses a provider nobody implements', () => {
    const { registry } = setup();
    expect(() => registry.openStorage({ provider: 'dropbox' })).toThrow('No storage provider called dropbox');
  });
});

describe('connect input', () => {
  test('only link providers parse connect input', () => {
    const { registry } = setup();
    expect(registry.resolveConnectInput(megaConnection.link).parsed).toEqual({ ok: true, connection: megaConnection });
    expect(registry.linkProviders.map(({ id }) => id)).toEqual(['mega']);
    expect(registry.signInProviders.map(({ id }) => id)).toEqual(['fake']);
  });

  test('a sign-in connection has no connect link', () => {
    const { registry } = setup();
    expect(registry.connectInputFor(megaConnection)).toBe(megaConnection.link);
    expect(registry.connectInputFor(driveConnection)).toBeUndefined();
  });
});

describe('sign-in', () => {
  test('signing in starts at the provider’s start path and returns to the given page', () => {
    const { drive, registry } = setup();
    expect(registry.signInHref(drive, '/connect/fake')).toBe('/api/auth/fake/start?return=%2Fconnect%2Ffake');
  });

  test('only a sign-in connection can reconnect', () => {
    const { registry } = setup();
    expect(registry.reconnectHref(driveConnection, '/books/3?q=x')).toBe('/api/auth/fake/start?return=%2Fbooks%2F3%3Fq%3Dx');
    expect(registry.reconnectHref(megaConnection, '/books/3')).toBeUndefined();
  });

  test('ending a sign-in connection signs out', async () => {
    const { auth, registry } = setup();

    await registry.endSignIn(driveConnection);
    await registry.endSignIn(megaConnection);

    expect(auth.requests).toEqual(['POST /api/auth/signout']);
  });
});
