import { describe, expect, test } from 'vitest';
import { googleProvider } from './provider.ts';

const tokens = { get: () => Promise.resolve('token') };

describe('googleProvider', () => {
  test('describes the Google Drive sign-in', () => {
    expect(googleProvider).toMatchObject({ kind: 'sign-in', id: 'google', name: 'Google Drive', startPath: '/api/auth/google/start' });
  });

  test('saves a picked library root as a Google connection', () => {
    const connection = googleProvider.connectionFor('folder-id');

    expect(connection).toEqual({ provider: 'google', root: 'folder-id' });
    expect(googleProvider.isConnection(connection)).toBe(true);
  });

  test.each([
    ['nothing stored', null],
    ['a bare folder id', 'folder-id'],
    ['a MEGA connection', { provider: 'mega', link: 'https://mega.nz/folder/abcdefgh#0123456789abcdefghijkl' }],
    ['a Google connection missing its root', { provider: 'google' }],
    ['a Google connection with an empty root', { provider: 'google', root: '' }],
    ['a Google connection with a non-string root', { provider: 'google', root: 42 }],
  ])('rejects %s', (_case, value) => {
    expect(googleProvider.isConnection(value)).toBe(false);
  });

  test('refuses to open a connection that is not Google’s', () => {
    expect(() => googleProvider.open({ provider: 'mega', link: 'x' }, tokens)).toThrow('Not a Google Drive connection');
  });

  test('opens a Google connection as a storage adapter', () => {
    expect(googleProvider.open({ provider: 'google', root: 'folder-id' }, tokens)).toMatchObject({
      stat: expect.any(Function),
      read: expect.any(Function),
    });
  });
});
