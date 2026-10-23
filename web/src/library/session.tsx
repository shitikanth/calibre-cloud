import { createContext, useContext, type ReactNode } from 'react';
import { useOpenLibrary, type OpenLibraryQuery } from './use-library.ts';
import { useLibraryUpdate, type LibraryUpdate } from './use-library-update.ts';

type LibrarySession = { library: OpenLibraryQuery; update: LibraryUpdate };

const LibrarySessionContext = createContext<LibrarySession | undefined>(undefined);

export function LibrarySessionProvider({ children }: { children: ReactNode }) {
  const library = useOpenLibrary();
  const update = useLibraryUpdate(library.data?.fromCache === true);
  return <LibrarySessionContext value={{ library, update }}>{children}</LibrarySessionContext>;
}

export function useLibrarySession(): LibrarySession {
  const session = useContext(LibrarySessionContext);
  if (!session) throw new Error('useLibrarySession must be used inside LibrarySessionProvider');
  return session;
}
