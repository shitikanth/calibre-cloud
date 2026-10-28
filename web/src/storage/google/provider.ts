import type { Connection } from '../provider.ts';
import type { SignInProvider } from '../sign-in.ts';
import { createDriveAdapter } from './adapter.ts';
import { createLibraryFinder } from './finder.ts';

type GoogleConnection = { provider: 'google'; root: string };

function isGoogleConnection(value: unknown): value is GoogleConnection {
  if (typeof value !== 'object' || value === null) return false;
  const { provider, root } = value as Record<string, unknown>;
  return provider === 'google' && typeof root === 'string' && root !== '';
}

export const googleProvider: SignInProvider = {
  kind: 'sign-in',
  id: 'google',
  name: 'Google Drive',
  startPath: '/api/auth/google/start',
  connectionFor(root) {
    const connection: GoogleConnection = { provider: 'google', root };
    return connection;
  },
  isConnection: (value): value is Connection => isGoogleConnection(value),
  libraryFinder: (tokens) => createLibraryFinder(tokens),
  open(connection, tokens) {
    if (!isGoogleConnection(connection)) throw new Error('Not a Google Drive connection');
    return createDriveAdapter(connection.root, tokens);
  },
};
