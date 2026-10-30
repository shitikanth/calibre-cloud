import type { ReactNode } from 'react';
import { AppBar } from './app-bar.tsx';

export function ConnectedShell({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <>
      <AppBar />
      <div className="pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <main className={`mx-auto px-4 py-6 sm:px-6 ${wide ? '' : 'max-w-6xl'}`}>
          {children}
        </main>
      </div>
    </>
  );
}
