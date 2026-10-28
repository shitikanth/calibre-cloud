import { NotFound } from '../adapter.ts';
import type { AccessTokens, FolderEntry, LibraryCandidate, LibraryFinder } from '../sign-in.ts';
import { createDriveClient, query, sharedWithMe, type DriveFile } from './drive.ts';

const myDrive = { id: 'root', name: 'My Drive' };
const sharedWithMeFolder = { id: sharedWithMe, name: 'Shared with me' };
const maxDepth = 100;
const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function createLibraryFinder(tokens: AccessTokens): LibraryFinder {
  const drive = createDriveClient(tokens);

  return {
    async findLibraries(signal) {
      const [hits, myDriveRoot] = await Promise.all([
        drive.list(query({ kind: 'file', name: 'metadata.db' }), 'parents', signal),
        drive.file('root', 'id', signal),
      ]);
      const folders = new Map<string, Promise<DriveFile | undefined>>();
      const folder = (id: string) => {
        let found = folders.get(id);
        if (!found) {
          found = drive.file(id, 'id,name,parents', signal).catch((error: unknown) => {
            if (error instanceof NotFound) return undefined;
            throw error;
          });
          folders.set(id, found);
        }
        return found;
      };

      const pathOf = async (id: string) => {
        const names: string[] = [];
        let current: string | undefined = id;
        while (current !== myDriveRoot.id && names.length < maxDepth) {
          const found: DriveFile | undefined = await folder(current);
          if (!found) break;
          names.unshift(found.name ?? '');
          current = found.parents?.[0];
          if (!current) break;
        }
        return [current === myDriveRoot.id ? myDrive.name : sharedWithMeFolder.name, ...names].join('/');
      };

      const roots = new Set(hits.flatMap(({ parents }) => parents?.slice(0, 1) ?? []));
      const candidates: LibraryCandidate[] = await Promise.all([...roots].map(async (id) => ({ root: id, path: await pathOf(id) })));
      return candidates.toSorted((a, b) => byName.compare(a.path, b.path));
    },

    async listFolder(folder, signal) {
      if (folder === undefined) return [myDrive, sharedWithMeFolder];
      const children = await drive.list(query({ kind: 'folder', in: folder }), 'id,name', signal);
      return children.map(({ id, name }): FolderEntry => ({ id, name: name ?? '' })).toSorted((a, b) => byName.compare(a.name, b.name));
    },
  };
}
