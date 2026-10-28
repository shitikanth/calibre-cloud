import { describeError } from './describe-error.ts';
import { DisconnectButton } from './disconnect-button.tsx';
import { ReconnectLink } from './reconnect-link.tsx';
import { SignInProblem } from './sign-in-outcome.tsx';

export function StorageErrorScreen({ error, retry }: { error: Error; retry: () => void }) {
  const { title, detail, canRetry, canSwitchLibrary, canReconnect } = describeError(error, 'library');
  return (
    <section role="alert">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-neutral-700">{detail}</p>
      {canReconnect && <SignInProblem className="mt-2" />}
      <div className="mt-4 flex flex-wrap gap-2">
        {canReconnect && <ReconnectLink className="rounded bg-neutral-900 px-4 py-2 text-white" />}
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
