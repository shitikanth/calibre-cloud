import { describe, expect, test } from 'vitest';
import { onedriveProvider } from './provider.ts';

const tokens = { get: () => Promise.resolve('token') };

describe('onedriveProvider', () => {
  test('describes the OneDrive sign-in', () => {
    expect(onedriveProvider).toMatchObject({ kind: 'sign-in', id: 'onedrive', name: 'OneDrive', startPath: '/api/auth/onedrive/start' });
  });

  test('saves a picked library root as a OneDrive connection', () => {
    const connection = onedriveProvider.connectionFor('/Books/Calibre Library');

    expect(connection).toEqual({ provider: 'onedrive', root: '/Books/Calibre Library' });
    expect(onedriveProvider.isConnection(connection)).toBe(true);
  });

  test('accepts the top of the OneDrive as a library root', () => {
    expect(onedriveProvider.isConnection({ provider: 'onedrive', root: '' })).toBe(true);
  });

  test.each([
    ['nothing stored', null],
    ['a bare path', '/Calibre Library'],
    ['a Dropbox connection', { provider: 'dropbox', root: '/calibre library' }],
    ['a OneDrive connection missing its root', { provider: 'onedrive' }],
    ['a OneDrive connection with a non-string root', { provider: 'onedrive', root: 42 }],
    ['a OneDrive connection with a relative root', { provider: 'onedrive', root: 'Calibre Library' }],
  ])('rejects %s', (_case, value) => {
    expect(onedriveProvider.isConnection(value)).toBe(false);
  });

  test('refuses to open a connection that is not OneDrive’s', () => {
    expect(() => onedriveProvider.open({ provider: 'dropbox', root: '/calibre library' }, tokens)).toThrow('Not a OneDrive connection');
  });

  test('opens a OneDrive connection as a storage adapter', () => {
    expect(onedriveProvider.open({ provider: 'onedrive', root: '/Calibre Library' }, tokens)).toMatchObject({
      stat: expect.any(Function),
      read: expect.any(Function),
    });
  });
});
