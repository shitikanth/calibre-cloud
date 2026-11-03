import type { ReactNode } from 'react';
import type { BookDetail } from '../library/protocol.ts';
import { useLibrarySession } from '../library/session.tsx';
import { useBook } from '../library/use-book.ts';
import { BookDetails } from './book-details.tsx';
import { LibraryNotices } from './library-notices.tsx';
import { LoadingLibrary } from './library-screen.tsx';
import { StorageErrorScreen } from './storage-error-screen.tsx';

export function BookScreen({ bookId }: { bookId: string }) {
  return (
    <OpenBook bookId={bookId}>
      {(book) => (
        <>
          <LibraryNotices />
          <BookDetails book={book} />
        </>
      )}
    </OpenBook>
  );
}

export type OpenedBook = { ready: true; book: BookDetail } | { ready: false; fallback: ReactNode };

function pending(fallback: ReactNode): OpenedBook {
  return { ready: false, fallback };
}

export function useOpenBook(bookId: string): OpenedBook {
  const { library } = useLibrarySession();
  const id = /^\d+$/.test(bookId) ? Number(bookId) : undefined;
  const book = useBook(id ?? 0, { enabled: library.isSuccess && id !== undefined });

  if (library.isError) return pending(<StorageErrorScreen error={library.error} retry={() => void library.refetch()} />);
  if (!library.isSuccess) return pending(<LoadingLibrary progress={library.progress} />);
  if (id === undefined) return pending(<BookNotFound />);
  if (book.isError) return pending(<StorageErrorScreen error={book.error} retry={() => void book.refetch()} />);
  if (book.data === null) return pending(<BookNotFound />);
  if (!book.data) return pending(null);
  return { ready: true, book: book.data };
}

export function OpenBook({ bookId, children }: { bookId: string; children: (book: BookDetail) => ReactNode }) {
  const opened = useOpenBook(bookId);
  return opened.ready ? children(opened.book) : opened.fallback;
}

function BookNotFound() {
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
