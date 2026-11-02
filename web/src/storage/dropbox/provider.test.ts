import { describe, expect, test } from 'vitest';
import { dropboxProvider } from './provider.ts';

const tokens = { get: () => Promise.resolve('token') };

describe('dropboxProvider', () => {
  test('describes the Dropbox sign-in', () => {
    expect(dropboxProvider).toMatchObject({ kind: 'sign-in', id: 'dropbox', name: 'Dropbox', startPath: '/api/auth/dropbox/start' });
  });

  test('saves a picked library root as a Dropbox connection', () => {
    const connection = dropboxProvider.connectionFor('/books/calibre library');

    expect(connection).toEqual({ provider: 'dropbox', root: '/books/calibre library' });
    expect(dropboxProvider.isConnection(connection)).toBe(true);
  });

  test('accepts the top of the Dropbox as a library root', () => {
    expect(dropboxProvider.isConnection({ provider: 'dropbox', root: '' })).toBe(true);
  });

  test.each([
    ['nothing stored', null],
    ['a bare path', '/calibre library'],
    ['a Google connection', { provider: 'google', root: 'folder-id' }],
    ['a Dropbox connection missing its root', { provider: 'dropbox' }],
    ['a Dropbox connection with a non-string root', { provider: 'dropbox', root: 42 }],
    ['a Dropbox connection with a relative root', { provider: 'dropbox', root: 'calibre library' }],
  ])('rejects %s', (_case, value) => {
    expect(dropboxProvider.isConnection(value)).toBe(false);
  });

  test('refuses to open a connection that is not Dropbox’s', () => {
    expect(() => dropboxProvider.open({ provider: 'google', root: 'folder-id' }, tokens)).toThrow('Not a Dropbox connection');
  });

  test('opens a Dropbox connection as a storage adapter', () => {
    expect(dropboxProvider.open({ provider: 'dropbox', root: '/calibre library' }, tokens)).toMatchObject({
      stat: expect.any(Function),
      read: expect.any(Function),
    });
  });
});
