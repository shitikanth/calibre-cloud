import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useLibrarySession } from '../library/session.tsx';
import { useDismissLibraryUpdate } from '../library/use-library-update.ts';
import { describeError } from './describe-error.ts';

export function LibraryNotices({ showChecking = false }: { showChecking?: boolean }) {
  const { update } = useLibrarySession();
  if (update.isFetching) {
    if (!showChecking) return null;
    return (
      <p role="status" className="mb-4 text-sm text-neutral-600">
        Checking for changes…
      </p>
    );
  }
  if (update.isError) {
    const { title, detail } = describeError(update.error, 'library');
    return (
      <div role="alert" className="mb-4 rounded bg-amber-50 px-3 py-2 text-amber-900">
        <p className="font-medium">{title}</p>
        <p className="text-sm">{detail} Showing the library saved on this device.</p>
      </div>
    );
  }
  if (!update.data) return null;
  return <LibraryUpdated />;
}

const autoHideAfter = 5_000;

function LibraryUpdated() {
  const dismiss = useDismissLibraryUpdate();
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(dismiss, autoHideAfter);
    const unsubscribe = router.subscribe('onBeforeNavigate', ({ pathChanged }) => {
      if (pathChanged) dismiss();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [dismiss, router]);
  return (
    <div className="mb-4 flex items-center justify-between gap-2 rounded bg-emerald-50 pl-3 text-emerald-900">
      <p role="status">Library updated</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-emerald-100"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
