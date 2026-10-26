import type { ReactNode } from 'react';
import { useLibrarySession } from '../library/session.tsx';
import { AppBar } from './app-bar.tsx';
import { LibraryNotices } from './library-notices.tsx';

export function ConnectedShell({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  const { update } = useLibrarySession();
  return (
    <>
      <AppBar />
      <main className={`mx-auto px-4 py-6 sm:px-6 ${wide ? '' : 'max-w-6xl'}`}>
        <LibraryNotices update={update} />
        {children}
      </main>
    </>
  );
}
