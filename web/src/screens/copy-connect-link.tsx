import { useEffect, useState } from 'react';
import { connectLinkHref } from '../connection/connect-link.ts';
import { useConnection } from '../connection/context.tsx';
import { connectInputFor } from '../storage/providers.ts';

const copiedMessageMs = 3000;

type Outcome = { copied: true } | { copied: false; href: string };

export function useCopyConnectLink() {
  const { connection } = useConnection();
  const input = connection && connectInputFor(connection);
  const [outcome, setOutcome] = useState<Outcome | undefined>();

  useEffect(() => {
    if (!outcome?.copied) return;
    const timer = setTimeout(() => setOutcome(undefined), copiedMessageMs);
    return () => clearTimeout(timer);
  }, [outcome]);

  const copy =
    input === undefined
      ? undefined
      : async () => {
          const href = connectLinkHref(location.origin, input);
          try {
            await navigator.clipboard.writeText(href);
            setOutcome({ copied: true });
          } catch {
            setOutcome({ copied: false, href });
          }
        };

  return { copy, outcome, dismiss: () => setOutcome(undefined) };
}

export type CopyConnectLink = ReturnType<typeof useCopyConnectLink>;

export function CopyConnectLinkOutcome({ copyLink, className }: { copyLink: CopyConnectLink; className: string }) {
  const { outcome, dismiss } = copyLink;
  if (!outcome) return null;
  if (outcome.copied) {
    return (
      <p role="status" className={`${className} text-sm text-neutral-700`}>
        Link copied
      </p>
    );
  }
  return (
    <div role="alert" className={`${className} flex flex-wrap items-center gap-2 text-sm`}>
      <span className="text-red-700">Couldn’t copy. Copy the link from here:</span>
      <input
        aria-label="Connect link"
        readOnly
        value={outcome.href}
        onFocus={(event) => event.currentTarget.select()}
        className="min-w-0 flex-1 rounded border border-neutral-400 px-2 py-1"
      />
      <button type="button" onClick={dismiss} className="rounded px-2 py-1 hover:bg-neutral-100">
        Close
      </button>
    </div>
  );
}
