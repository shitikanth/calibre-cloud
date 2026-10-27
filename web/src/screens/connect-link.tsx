import { useLocation, useRouter } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { readConnectLink } from '../connection/connect-link.ts';
import { sameConnection, type Connection } from '../connection/connection.ts';
import { useConnection } from '../connection/context.tsx';
import { useDisconnect } from '../library/use-disconnect.ts';
import { resolveConnectInput } from '../storage/providers.ts';
import { DisconnectFailure } from './disconnect-button.tsx';

type Pending = { kind: 'fill'; input: string } | { kind: 'switch'; connection: Connection };

const ConnectLinkInput = createContext<string | undefined>(undefined);

function pendingFor(input: string | undefined, current: Connection | undefined): Pending | undefined {
  if (input === undefined) return undefined;
  if (!current) return { kind: 'fill', input };
  const { parsed } = resolveConnectInput(input);
  if (!parsed.ok || sameConnection(parsed.connection, current)) return undefined;
  return { kind: 'switch', connection: parsed.connection };
}

export function ConnectLinkHandler({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const { hash, pathname, searchStr } = useLocation();
  const { history } = useRouter();
  const [pending, setPending] = useState(() => pendingFor(readConnectLink(hash), connection));

  useEffect(() => {
    if (readConnectLink(hash) !== undefined) history.replace(`${pathname}${searchStr}`);
  }, [hash, pathname, searchStr, history]);

  if (pending?.kind === 'fill' && connection) setPending(undefined);

  return (
    <ConnectLinkInput value={pending?.kind === 'fill' ? pending.input : undefined}>
      {children}
      {pending?.kind === 'switch' && (
        <SwitchLibraryDialog connection={pending.connection} onClose={() => setPending(undefined)} />
      )}
    </ConnectLinkInput>
  );
}

export function useConnectLinkInput(): string | undefined {
  return useContext(ConnectLinkInput);
}

const buttonClass = 'min-h-11 rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-60';

function SwitchLibraryDialog({ connection, onClose }: { connection: Connection; onClose: () => void }) {
  const { connect } = useConnection();
  const disconnect = useDisconnect();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const close = () => dialog.current?.close();
  const switchLibrary = async () => {
    try {
      await disconnect.mutateAsync();
    } catch {
      return;
    }
    connect(connection);
    close();
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (disconnect.isPending) event.preventDefault();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded border border-neutral-300 bg-white p-0 text-neutral-900 shadow-lg backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 id={titleId} className="font-semibold">
          Switch to this library?
        </h2>
        <p className="text-sm text-neutral-600">
          The link you opened is for a different library. Switching disconnects the library you have now and forgets
          its books, covers and reading positions on this device.
        </p>
        <DisconnectFailure disconnect={disconnect} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} disabled={disconnect.isPending} onClick={close}>
            Cancel
          </button>
          <button type="button" className={buttonClass} disabled={disconnect.isPending} onClick={() => void switchLibrary()}>
            Switch
          </button>
        </div>
      </div>
    </dialog>
  );
}
