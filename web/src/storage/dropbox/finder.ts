import type { AccessTokens, FolderEntry, LibraryCandidate, LibraryFinder } from '../sign-in.ts';
import { createDropboxClient } from './dropbox.ts';

const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

export function createLibraryFinder(tokens: AccessTokens): LibraryFinder {
  const dropbox = createDropboxClient(tokens);

  return {
    async findLibraries(signal) {
      const hits = await dropbox.search('metadata.db', signal);
      const libraries = new Map<string, LibraryCandidate>();
      for (const hit of hits) {
        if (hit['.tag'] !== 'file' || hit.name.toLowerCase() !== 'metadata.db' || hit.path_lower === undefined) continue;
        const root = parentOf(hit.path_lower);
        libraries.set(root, { root, path: parentOf(hit.path_display ?? hit.path_lower) || '/' });
      }
      return [...libraries.values()].toSorted((a, b) => byName.compare(a.path, b.path));
    },

    async listFolder(folder, signal) {
      const entries = await dropbox.listFolder(folder ?? '', signal);
      return entries
        .flatMap(({ '.tag': tag, name, path_lower: id }): FolderEntry[] => (tag === 'folder' && id !== undefined ? [{ id, name }] : []))
        .toSorted((a, b) => byName.compare(a.name, b.name));
    },
  };
}
