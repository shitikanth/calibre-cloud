import { useBookCount, useBooks, useOpenLibrary, type DownloadProgress } from '../library/use-library.ts';
import { BookGrid } from './book-grid.tsx';
import { LoadMore } from './load-more.tsx';
import { StorageErrorScreen } from './storage-error-screen.tsx';

export function LibraryScreen() {
  const library = useOpenLibrary();
  const count = useBookCount(library.isSuccess);
  const books = useBooks(library.isSuccess);

  if (library.isError) return <StorageErrorScreen error={library.error} retry={() => void library.refetch()} />;
  if (count.isError) return <StorageErrorScreen error={count.error} retry={() => void count.refetch()} />;
  if (books.isError) return <StorageErrorScreen error={books.error} retry={() => void books.refetch()} />;
  if (!library.isSuccess) return <LoadingLibrary progress={library.progress} />;

  return (
    <section>
      <h1 className="text-3xl font-semibold">Library</h1>
      {count.isSuccess && <p className="mt-2 text-neutral-600">{formatBookCount(count.data)}</p>}
      {books.isSuccess && <BookGrid books={books.data} />}
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

function LoadingLibrary({ progress }: { progress: DownloadProgress | undefined }) {
  const percent = progress && progress.total > 0 ? Math.floor((progress.loaded / progress.total) * 100) : undefined;
  return (
    <section>
      <h1 className="text-xl font-semibold">Loading your library…</h1>
      <progress
        className="mt-4 w-full"
        aria-label="Downloading library"
        max={100}
        {...(percent === undefined ? {} : { value: percent })}
      />
      {percent !== undefined && <p className="mt-1 text-sm text-neutral-600">{percent}%</p>}
    </section>
  );
}

function formatBookCount(count: number): string {
  return count === 1 ? '1 book' : `${count.toLocaleString()} books`;
}
