import type { ReactNode } from 'react';
import { AppBar } from './app-bar.tsx';

export function ConnectedShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AppBar />
      <div className="pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </>
  );
}
