import type { ReactNode } from 'react';
import { AppBar } from './app-bar.tsx';

export function ConnectedShell({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <>
      <AppBar />
      <main className={`mx-auto px-4 py-6 sm:px-6 ${wide ? '' : 'max-w-6xl'}`}>
        {children}
      </main>
    </>
  );
}
