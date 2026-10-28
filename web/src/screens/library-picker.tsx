import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useConnection, useProviders } from '../connection/context.tsx';
import { NotFound } from '../storage/adapter.ts';
import type { FolderEntry, LibraryFinder, SignInProvider } from '../storage/sign-in.ts';
import { describeError } from './describe-error.ts';

export function pickerPath(providerId: string): string {
  return `/connect/${encodeURIComponent(providerId)}`;
}

const rowClass =
  'flex min-h-11 w-full items-center rounded border border-neutral-300 px-3 py-2 text-left hover:bg-neutral-100 disabled:opacity-60';
const secondaryClass =
  'inline-flex min-h-11 items-center rounded border border-neutral-400 px-4 py-2 hover:bg-neutral-100 disabled:opacity-60';

type Pick = ReturnType<typeof usePick>;

function usePick(provider: SignInProvider) {
  const { connect } = useConnection();
  const { openStorage } = useProviders();
  return useMutation({
    mutationFn: async (root: string) => {
      const connection = provider.connectionFor(root);
      await openStorage(connection).stat('metadata.db');
      return connection;
    },
    onSuccess: connect,
  });
}

export function LibraryPicker({ provider }: { provider: SignInProvider }) {
  const { libraryFinder } = useProviders();
  const finder = useMemo(() => libraryFinder(provider), [libraryFinder, provider]);
  const [browsing, setBrowsing] = useState(false);
  const pick = usePick(provider);

  return (
    <div className="flex justify-center sm:py-12">
      <section
        aria-labelledby="picker-title"
        className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <h1 id="picker-title" className="text-2xl font-semibold">
          Choose your library
        </h1>
        <p className="mt-2 text-neutral-600">Pick the folder that holds your Calibre library.</p>
        <div className="mt-6 flex flex-col gap-3">
          {browsing ? (
            <FolderBrowser provider={provider} finder={finder} pick={pick} />
          ) : (
            <SearchResults provider={provider} finder={finder} pick={pick} browse={() => setBrowsing(true)} />
          )}
          <PickOutcome provider={provider} pick={pick} />
        </div>
        <Link to="/" className={`${secondaryClass} mt-6`}>
          Cancel
        </Link>
      </section>
    </div>
  );
}

type ViewProps = { provider: SignInProvider; finder: LibraryFinder; pick: Pick };

function SearchResults({ provider, finder, pick, browse }: ViewProps & { browse: () => void }) {
  const search = useQuery({
    queryKey: ['library-candidates', provider.id],
    networkMode: 'always',
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => finder.findLibraries(signal),
  });

  const browseButton = (
    <button type="button" className={`${secondaryClass} self-start`} disabled={pick.isPending} onClick={browse}>
      Browse folders
    </button>
  );

  if (search.isPending) return <Loading>Searching for Calibre libraries…</Loading>;
  if (search.isError) {
    return (
      <>
        <PickerError provider={provider} error={search.error} retry={() => void search.refetch()} />
        {browseButton}
      </>
    );
  }
  return (
    <>
      {search.data.length === 0 ? (
        <p>No Calibre library found. Browse your folders instead.</p>
      ) : (
        <ul aria-label="Libraries found" className="flex flex-col gap-2">
          {search.data.map(({ root, path }) => (
            <li key={root}>
              <button type="button" className={rowClass} disabled={pick.isPending} onClick={() => pick.mutate(root)}>
                {path}
              </button>
            </li>
          ))}
        </ul>
      )}
      {browseButton}
    </>
  );
}

function FolderBrowser({ provider, finder, pick }: ViewProps) {
  const [trail, setTrail] = useState<FolderEntry[]>([]);
  const current = trail.at(-1);
  const folders = useQuery({
    queryKey: ['library-folders', provider.id, current?.id ?? null],
    networkMode: 'always',
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => finder.listFolder(current?.id, signal),
  });

  return (
    <>
      <div className="flex items-center gap-2">
        {current && (
          <button
            type="button"
            className={secondaryClass}
            disabled={pick.isPending}
            onClick={() => setTrail(trail.slice(0, -1))}
          >
            Up
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate font-medium">{current?.name ?? 'All folders'}</h2>
      </div>
      {folders.isPending ? (
        <Loading>Loading folders…</Loading>
      ) : folders.isError ? (
        <PickerError provider={provider} error={folders.error} retry={() => void folders.refetch()} />
      ) : folders.data.length === 0 ? (
        <p className="text-neutral-600">No folders here.</p>
      ) : (
        <ul aria-label="Folders" className="flex flex-col gap-2">
          {folders.data.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                className={rowClass}
                disabled={pick.isPending}
                onClick={() => setTrail([...trail, folder])}
              >
                {folder.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {current && (
        <button
          type="button"
          className="inline-flex min-h-11 items-center self-start rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-60"
          disabled={pick.isPending}
          onClick={() => pick.mutate(current.id)}
        >
          Use this folder
        </button>
      )}
    </>
  );
}

function PickOutcome({ provider, pick }: { provider: SignInProvider; pick: Pick }) {
  if (pick.isPending) return <Loading>Opening library…</Loading>;
  if (!pick.isError) return null;
  if (pick.error instanceof NotFound) {
    return (
      <p role="alert" className="text-red-700">
        This folder has no Calibre library. Pick the folder that holds metadata.db.
      </p>
    );
  }
  return <PickerError provider={provider} error={pick.error} />;
}

function PickerError({ provider, error, retry }: { provider: SignInProvider; error: Error; retry?: () => void }) {
  const { signInHref } = useProviders();
  const { title, detail, canRetry, canReconnect } = describeError(error, 'library');
  return (
    <div role="alert" className="flex flex-col gap-2">
      <p className="font-medium text-red-700">{title}</p>
      <p className="text-neutral-700">{detail}</p>
      {canReconnect ? (
        <a href={signInHref(provider, pickerPath(provider.id))} className={`${secondaryClass} self-start`}>
          Sign in again
        </a>
      ) : (
        canRetry &&
        retry && (
          <button type="button" className={`${secondaryClass} self-start`} onClick={retry}>
            Try again
          </button>
        )
      )}
    </div>
  );
}

function Loading({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-neutral-600">
      {children}
    </p>
  );
}
