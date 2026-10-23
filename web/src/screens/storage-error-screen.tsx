import { LibraryInUse } from '../library/errors.ts';
import { Aborted, Network, NotFound, QuotaExceeded, ReconnectRequired } from '../storage/adapter.ts';
import { DisconnectButton } from './disconnect-button.tsx';

type ErrorCopy = { title: string; detail: string; canRetry: boolean };

export function describeStorageError(error: Error): ErrorCopy {
  if (error instanceof LibraryInUse)
    return {
      title: 'Library is open in another tab',
      detail: 'This browser can show the library in one tab at a time. Close the other tab, then try again.',
      canRetry: true,
    };
  if (error instanceof NotFound)
    return {
      title: 'Wrong folder',
      detail:
        'This folder has no metadata.db at its root, or the link no longer works. Share the folder Calibre uses as its library and connect again.',
      canRetry: false,
    };
  if (error instanceof QuotaExceeded)
    return {
      title: 'Download quota exceeded',
      detail: 'Your storage provider has paused downloads for now. Try later.',
      canRetry: true,
    };
  if (error instanceof Network)
    return {
      title: 'Couldn’t reach your library',
      detail: 'Check your internet connection and try again.',
      canRetry: true,
    };
  if (error instanceof ReconnectRequired)
    return { title: 'Reconnect your library', detail: 'Your access has expired. Connect again.', canRetry: false };
  if (error instanceof Aborted) return { title: 'Loading stopped', detail: 'Loading was cancelled.', canRetry: true };
  return { title: 'Couldn’t open this library', detail: error.message, canRetry: true };
}

export function StorageErrorScreen({ error, retry }: { error: Error; retry: () => void }) {
  const { title, detail, canRetry } = describeStorageError(error);
  const openElsewhere = error instanceof LibraryInUse;
  return (
    <section role="alert">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-neutral-700">{detail}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canRetry && (
          <button type="button" className="rounded bg-neutral-900 px-4 py-2 text-white" onClick={retry}>
            Try again
          </button>
        )}
        {!openElsewhere && (
          <DisconnectButton className="rounded border border-neutral-400 px-4 py-2 disabled:opacity-60">
            Connect a different library
          </DisconnectButton>
        )}
      </div>
    </section>
  );
}
