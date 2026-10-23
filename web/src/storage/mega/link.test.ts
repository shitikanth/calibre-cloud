import { describe, expect, test } from 'vitest';
import { parseMegaFolderLink } from './link.ts';

describe('parseMegaFolderLink', () => {
  test('accepts a shared folder link with its key', () => {
    expect(parseMegaFolderLink('https://mega.nz/folder/AbC-12_x#k3y-Value_09')).toEqual({
      ok: true,
      link: 'https://mega.nz/folder/AbC-12_x#k3y-Value_09',
    });
  });

  test('ignores surrounding whitespace from a paste', () => {
    expect(parseMegaFolderLink('  https://mega.nz/folder/AbC#key\n')).toEqual({
      ok: true,
      link: 'https://mega.nz/folder/AbC#key',
    });
  });

  test.each([
    ['no fragment', 'https://mega.nz/folder/AbC'],
    ['an empty fragment', 'https://mega.nz/folder/AbC#'],
  ])('rejects a folder link with %s as missing its key', (_case, input) => {
    expect(parseMegaFolderLink(input)).toEqual({ ok: false, problem: 'missing-key' });
  });

  test.each([
    ['a file link', 'https://mega.nz/file/AbC#key'],
    ['a link to a subfolder inside a share', 'https://mega.nz/folder/AbC#key/folder/Sub'],
    ['a link to a file inside a share', 'https://mega.nz/folder/AbC#key/file/Doc'],
    ['a password-protected link', 'https://mega.nz/#P!AgBkZXJ0eQ'],
    ['the legacy folder format', 'https://mega.nz/#F!AbC!key'],
    ['another host', 'https://example.com/folder/AbC#key'],
    ['plain http', 'http://mega.nz/folder/AbC#key'],
    ['a handle with illegal characters', 'https://mega.nz/folder/Ab%20C#key'],
    ['text that is not a URL', 'my library'],
    ['an empty string', ''],
  ])('rejects %s as not a folder link', (_case, input) => {
    expect(parseMegaFolderLink(input)).toEqual({ ok: false, problem: 'not-a-folder-link' });
  });
});
