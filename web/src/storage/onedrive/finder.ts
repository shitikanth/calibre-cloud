import type { AccessTokens, FolderEntry, LibraryCandidate, LibraryFinder } from '../sign-in.ts';
import { createGraphClient, pathOfReference } from './graph.ts';

const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function createLibraryFinder(tokens: AccessTokens): LibraryFinder {
  const graph = createGraphClient(tokens);

  return {
    async findLibraries(signal) {
      const hits = (await graph.search('metadata.db', signal)).filter((hit) => hit.file && hit.name.toLowerCase() === 'metadata.db');
      const roots = await Promise.all(
        hits.map(async (hit) => pathOfReference(hit.parentReference) ?? pathOfReference((await graph.itemById(hit.id, signal)).parentReference)),
      );
      const libraries = new Map<string, LibraryCandidate>();
      for (const root of roots) {
        if (root !== undefined) libraries.set(root.toLowerCase(), { root, path: root || '/' });
      }
      return [...libraries.values()].toSorted((a, b) => byName.compare(a.path, b.path));
    },

    async listFolder(folder, signal) {
      const parent = folder ?? '';
      const entries = await graph.children(parent, signal);
      return entries
        .flatMap(({ folder: isFolder, name }): FolderEntry[] => (isFolder ? [{ id: `${parent}/${name}`, name }] : []))
        .toSorted((a, b) => byName.compare(a.name, b.name));
    },
  };
}
