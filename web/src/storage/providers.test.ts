import { describe, expect, test } from 'vitest';
import { openStorage, readConnection } from './providers.ts';

const megaConnection = { provider: 'mega', link: 'https://mega.nz/folder/abcdefgh#0123456789abcdefghijkl' };

describe('readConnection', () => {
  test('accepts a stored MEGA connection', () => {
    expect(readConnection(megaConnection)).toBe(megaConnection);
  });

  test.each([
    ['nothing stored', null],
    ['a bare link', megaConnection.link],
    ['an object with no provider', { link: megaConnection.link }],
    ['a provider nobody implements', { provider: 'dropbox', path: '/Calibre Library' }],
    ['a MEGA connection missing its link', { provider: 'mega' }],
  ])('rejects %s', (_case, value) => {
    expect(readConnection(value)).toBeUndefined();
  });
});

describe('openStorage', () => {
  test('opens a MEGA connection as a storage adapter', () => {
    expect(openStorage(megaConnection)).toMatchObject({ stat: expect.any(Function), read: expect.any(Function) });
  });

  test('refuses a provider nobody implements', () => {
    expect(() => openStorage({ provider: 'dropbox' })).toThrow('No storage provider called dropbox');
  });
});
