import { describeError } from './describe-error.ts';
import { DisconnectButton } from './disconnect-button.tsx';

export function StorageErrorScreen({ error, retry }: { error: Error; retry: () => void }) {
  const { title, detail, canRetry, canSwitchLibrary } = describeError(error, 'library');
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
        {canSwitchLibrary && (
          <DisconnectButton className="rounded border border-neutral-400 px-4 py-2 disabled:opacity-60">
            Connect a different library
          </DisconnectButton>
        )}
      </div>
    </section>
  );
}
