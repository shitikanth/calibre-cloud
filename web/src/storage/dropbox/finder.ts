import type { LibraryFinder } from '../sign-in.ts';

export function createLibraryFinder(): LibraryFinder {
  return {
    findLibraries: () => Promise.resolve([]),
    listFolder: () => Promise.resolve([]),
  };
}
