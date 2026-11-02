import type { Connection } from '../provider.ts';
import type { SignInProvider } from '../sign-in.ts';
import { createDropboxAdapter } from './adapter.ts';
import { createLibraryFinder } from './finder.ts';
import icon from './icon.svg';

type DropboxConnection = { provider: 'dropbox'; root: string };

function isDropboxConnection(value: unknown): value is DropboxConnection {
  if (typeof value !== 'object' || value === null) return false;
  const { provider, root } = value as Record<string, unknown>;
  return provider === 'dropbox' && typeof root === 'string' && (root === '' || root.startsWith('/'));
}

export const dropboxProvider: SignInProvider = {
  kind: 'sign-in',
  id: 'dropbox',
  name: 'Dropbox',
  icon,
  startPath: '/api/auth/dropbox/start',
  connectionFor(root) {
    const connection: DropboxConnection = { provider: 'dropbox', root };
    return connection;
  },
  isConnection: (value): value is Connection => isDropboxConnection(value),
  libraryFinder: createLibraryFinder,
  open(connection, tokens) {
    if (!isDropboxConnection(connection)) throw new Error('Not a Dropbox connection');
    return createDropboxAdapter(connection.root, tokens);
  },
};
