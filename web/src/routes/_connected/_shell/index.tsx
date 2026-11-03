import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useLibrarySession } from '../../../library/session.tsx';
import { useBooks } from '../../../library/use-library.ts';
import { BookGrid } from './-library/book-grid.tsx';
import { ContinueReading } from './-library/continue-reading.tsx';
import { LibraryNotices } from './-shell/library-notices.tsx';
import { LoadMore } from './-library/load-more.tsx';
import { LoadingLibrary } from '../-connected/loading-library.tsx';
import { StorageErrorScreen } from '../-connected/storage-error-screen.tsx';

export const Route = createFileRoute('/_connected/_shell/')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = search['q'];
    return typeof q === 'string' || typeof q === 'number' ? { q: String(q) } : {};
  },
  component: LibraryRoute,
});

function LibraryRoute() {
  const { library } = useLibrarySession();
  const { q: search = '' } = useSearch({ strict: false });
  const books = useBooks(library.isSuccess, search);

  if (library.isError) return <StorageErrorScreen error={library.error} retry={() => void library.refetch()} />;
  if (books.isError) return <StorageErrorScreen error={books.error} retry={() => void books.refetch()} />;
  if (!library.isSuccess) return <LoadingLibrary progress={library.progress} />;

  return (
    <section>
      <LibraryNotices showChecking />
      {!search.trim() && <ContinueReading />}
      {books.isSuccess &&
        (books.data.length === 0 && search.trim() ? (
          <p className="text-neutral-600">No books match “{search.trim()}”.</p>
        ) : (
          <BookGrid books={books.data} />
        ))}
      {books.hasNextPage && (
        <LoadMore
          loaded={books.data?.length ?? 0}
          loading={books.isFetchingNextPage}
          loadMore={books.fetchNextPage}
        />
      )}
    </section>
  );
}
