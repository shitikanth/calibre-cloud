import type { LibraryUpdate } from '../library/use-library-update.ts';
import { describeError } from './describe-error.ts';

export function LibraryNotices({ update }: { update: LibraryUpdate }) {
  if (update.isFetching) return null;
  if (update.isError) {
    const { title, detail } = describeError(update.error, 'library');
    return (
      <div role="alert" className="mt-4 rounded bg-amber-50 px-3 py-2 text-amber-900">
        <p className="font-medium">{title}</p>
        <p className="text-sm">{detail} Showing the library saved on this device.</p>
      </div>
    );
  }
  if (!update.data) return null;
  return (
    <p role="status" className="mt-4 rounded bg-emerald-50 px-3 py-2 text-emerald-900">
      Library updated
    </p>
  );
}
