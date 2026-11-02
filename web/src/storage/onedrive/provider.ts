import type { Connection } from '../provider.ts';
import type { SignInProvider } from '../sign-in.ts';
import { createOneDriveAdapter } from './adapter.ts';
import { createLibraryFinder } from './finder.ts';
import icon from './icon.svg';

type OneDriveConnection = { provider: 'onedrive'; root: string };

function isOneDriveConnection(value: unknown): value is OneDriveConnection {
  if (typeof value !== 'object' || value === null) return false;
  const { provider, root } = value as Record<string, unknown>;
  return provider === 'onedrive' && typeof root === 'string' && (root === '' || root.startsWith('/'));
}

export const onedriveProvider: SignInProvider = {
  kind: 'sign-in',
  id: 'onedrive',
  name: 'OneDrive',
  icon,
  startPath: '/api/auth/onedrive/start',
  connectionFor(root) {
    const connection: OneDriveConnection = { provider: 'onedrive', root };
    return connection;
  },
  isConnection: (value): value is Connection => isOneDriveConnection(value),
  libraryFinder: createLibraryFinder,
  open(connection, tokens) {
    if (!isOneDriveConnection(connection)) throw new Error('Not a OneDrive connection');
    return createOneDriveAdapter(connection.root, tokens);
  },
};
