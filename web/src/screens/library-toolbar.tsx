import type { useLibraryUpdate } from '../library/use-library-update.ts';

type LibraryUpdate = ReturnType<typeof useLibraryUpdate>;

export function LibraryToolbar({ update }: { update: LibraryUpdate }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-sm">
      <button
        type="button"
        className="rounded border border-neutral-400 px-3 py-1 disabled:opacity-60"
        disabled={update.isFetching}
        onClick={() => void update.refetch()}
      >
        {update.isFetching ? 'Checking for changes…' : 'Refresh library'}
      </button>
    </div>
  );
}
