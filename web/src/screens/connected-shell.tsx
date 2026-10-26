import type { ReactNode } from 'react';
import { useLibrarySession } from '../library/session.tsx';
import { AppBar } from './app-bar.tsx';
import { LibraryNotices } from './library-notices.tsx';

export function ConnectedShell({ children }: { children: ReactNode }) {
  const { update } = useLibrarySession();
  return (
    <>
      <AppBar />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <LibraryNotices update={update} />
        {children}
      </main>
    </>
  );
}
