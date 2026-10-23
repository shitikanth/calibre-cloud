import type { useLibraryUpdate } from '../library/use-library-update.ts';

type LibraryUpdate = ReturnType<typeof useLibraryUpdate>;

export function LibraryNotices({ update }: { update: LibraryUpdate }) {
  if (update.isFetching || !update.data) return null;
  return (
    <p role="status" className="mt-4 rounded bg-emerald-50 px-3 py-2 text-emerald-900">
      Library updated
    </p>
  );
}
