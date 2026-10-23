import type { ReactNode } from 'react';
import { useDisconnect } from '../library/use-disconnect.ts';

export function DisconnectButton({ className, children }: { className: string; children: ReactNode }) {
  const disconnect = useDisconnect();
  return (
    <>
      <button type="button" className={className} disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
        {children}
      </button>
      {disconnect.isError && (
        <p role="alert" className="w-full text-sm text-red-700">
          Couldn’t disconnect: {disconnect.error.message}
        </p>
      )}
    </>
  );
}
