import { useLibrarySession } from '../library/session.tsx';
import { useBooks, type LoadProgress } from '../library/use-library.ts';
import { useSearch } from '@tanstack/react-router';
import { BookGrid } from './book-grid.tsx';
import { LoadMore } from './load-more.tsx';
import { ProgressBar } from './progress-bar.tsx';
import { StorageErrorScreen } from './storage-error-screen.tsx';

export function LibraryScreen() {
  const { library } = useLibrarySession();
  const { q: search = '' } = useSearch({ from: '/' });
  const books = useBooks(library.isSuccess, search);

  if (library.isError) return <StorageErrorScreen error={library.error} retry={() => void library.refetch()} />;
  if (books.isError) return <StorageErrorScreen error={books.error} retry={() => void books.refetch()} />;
  if (!library.isSuccess) return <LoadingLibrary progress={library.progress} />;

  return (
    <section>
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

export function LoadingLibrary({ progress }: { progress: LoadProgress | undefined }) {
  return (
    <section>
      <h1 className="text-xl font-semibold">Loading your library…</h1>
      <ProgressBar
        label="Downloading library"
        loaded={progress?.loaded ?? 0}
        total={progress?.total ?? 0}
        className="mt-4 w-full"
      />
    </section>
  );
}
