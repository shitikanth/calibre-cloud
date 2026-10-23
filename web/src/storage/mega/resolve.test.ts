import { describe, expect, test } from 'vitest';
import { resolveLibraryPath, type FolderTreeNode } from './resolve.ts';

interface Node extends FolderTreeNode<Node> {
  id: string;
}

function file(id: string, name: string | null, timestamp = 1): Node {
  return { id, name, directory: false, timestamp };
}

function folder(id: string, name: string | null, children: Node[], timestamp = 1): Node {
  return { id, name, directory: true, timestamp, children };
}

const resolve = (root: Node, path: string) => resolveLibraryPath(root, path)?.id;

describe('resolveLibraryPath', () => {
  const library = folder('root', 'Library', [
    file('db', 'metadata.db'),
    folder('author', 'Charlotte Bronte', [
      folder('book', 'Jane Eyre (1)', [file('cover', 'cover.jpg'), file('epub', 'Jane Eyre - Charlotte Bronte.epub')]),
    ]),
  ]);

  test('finds a file at the library root', () => {
    expect(resolve(library, 'metadata.db')).toBe('db');
  });

  test('finds a file nested in folders', () => {
    expect(resolve(library, 'Charlotte Bronte/Jane Eyre (1)/cover.jpg')).toBe('cover');
  });

  test.each([
    ['a missing file', 'missing.db'],
    ['a file in a missing folder', 'Nobody/Jane Eyre (1)/cover.jpg'],
    ['a path that treats a file as a folder', 'metadata.db/cover.jpg'],
    ['a path that names a folder', 'Charlotte Bronte'],
    ['an empty path', ''],
  ])('finds nothing for %s', (_case, path) => {
    expect(resolve(library, path)).toBeUndefined();
  });

  test('falls back to a case-insensitive match when no name matches exactly', () => {
    expect(resolve(library, 'charlotte bronte/JANE EYRE (1)/Cover.JPG')).toBe('cover');
  });

  test('prefers an exact match over a newer case-insensitive one', () => {
    const root = folder('root', 'Library', [file('upper', 'METADATA.DB', 9), file('exact', 'metadata.db', 1)]);
    expect(resolve(root, 'metadata.db')).toBe('exact');
  });

  test('picks the most recently modified of duplicate exact matches', () => {
    const root = folder('root', 'Library', [
      file('old', 'metadata.db', 100),
      file('new', 'metadata.db', 300),
      file('mid', 'metadata.db', 200),
    ]);
    expect(resolve(root, 'metadata.db')).toBe('new');
  });

  test('picks the most recently modified of duplicate case-insensitive matches', () => {
    const root = folder('root', 'Library', [file('old', 'Metadata.db', 100), file('new', 'METADATA.DB', 200)]);
    expect(resolve(root, 'metadata.db')).toBe('new');
  });

  test('follows the most recently modified of duplicate folders', () => {
    const root = folder('root', 'Library', [
      folder('old-dir', 'Author', [file('old', 'cover.jpg', 500)], 100),
      folder('new-dir', 'Author', [file('new', 'cover.jpg', 1)], 200),
    ]);
    expect(resolve(root, 'Author/cover.jpg')).toBe('new');
  });

  test('skips nodes whose names could not be decrypted', () => {
    const root = folder('root', 'Library', [file('undecrypted', null), file('db', 'metadata.db')]);
    expect(resolve(root, 'metadata.db')).toBe('db');
  });
});
