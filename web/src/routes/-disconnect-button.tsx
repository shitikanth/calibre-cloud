import type { ReactNode } from 'react';
import { useDisconnect, type Disconnect } from '../library/use-disconnect.ts';

export function DisconnectButton({ className, children }: { className: string; children: ReactNode }) {
  const disconnect = useDisconnect();
  return (
    <>
      <button type="button" className={className} disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
        {children}
      </button>
      <DisconnectFailure disconnect={disconnect} className="w-full" />
    </>
  );
}

export function DisconnectFailure({ disconnect, className = '' }: { disconnect: Disconnect; className?: string }) {
  if (!disconnect.isError) return null;
  return (
    <p role="alert" className={`${className} text-sm text-red-700`}>
      Couldn’t disconnect: {disconnect.error.message}
    </p>
  );
}
