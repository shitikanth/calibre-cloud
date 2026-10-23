import { useLibrarySession } from '../library/session.tsx';
import { useBook } from '../library/use-book.ts';
import { BookDetails } from './book-details.tsx';
import { LoadingLibrary } from './library-screen.tsx';
import { StorageErrorScreen } from './storage-error-screen.tsx';

export function BookScreen({ bookId }: { bookId: string }) {
  const { library } = useLibrarySession();

  if (library.isError) return <StorageErrorScreen error={library.error} retry={() => void library.refetch()} />;
  if (!library.isSuccess) return <LoadingLibrary progress={library.progress} />;
  if (!/^\d+$/.test(bookId)) return <BookNotFound />;
  return <OpenBook id={Number(bookId)} />;
}

function OpenBook({ id }: { id: number }) {
  const book = useBook(id);

  if (book.isError) return <StorageErrorScreen error={book.error} retry={() => void book.refetch()} />;
  if (book.data === null) return <BookNotFound />;
  if (!book.data) return null;

  return <BookDetails book={book.data} />;
}

export function BookNotFound() {
  return <NotFound title="Book not found" detail="This book isn’t in your library any more." />;
}

export function NotFound({ title, detail }: { title: string; detail: string }) {
  return (
    <section>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-neutral-700">{detail}</p>
    </section>
  );
}
