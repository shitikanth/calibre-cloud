import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { LibraryIndex } from './library-index.ts';

const LibraryIndexContext = createContext<LibraryIndex | undefined>(undefined);

export function LibraryIndexProvider({ children }: { children: ReactNode }) {
  const [index] = useState(() => new LibraryIndex());
  useEffect(() => () => index.dispose(), [index]);
  return <LibraryIndexContext value={index}>{children}</LibraryIndexContext>;
}

export function useLibraryIndex(): LibraryIndex {
  const index = useContext(LibraryIndexContext);
  if (!index) throw new Error('useLibraryIndex must be used inside LibraryIndexProvider');
  return index;
}
