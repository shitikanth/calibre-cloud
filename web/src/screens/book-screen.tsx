import type { ReactNode } from 'react';
import type { BookDetail } from '../library/protocol.ts';
import { useLibrarySession } from '../library/session.tsx';
import { useBook } from '../library/use-book.ts';
import { BookDetails } from './book-details.tsx';
import { LibraryNotices } from './library-notices.tsx';
import { LoadingLibrary } from './library-screen.tsx';
import { StorageErrorScreen } from './storage-error-screen.tsx';

export function BookScreen({ bookId }: { bookId: string }) {
  const opened = useOpenBook(bookId);
  if (!opened.ready) return opened.fallback;
  return (
    <>
      <LibraryNotices />
      <BookDetails book={opened.book} />
    </>
  );
}

export type Fallback = { ready: false; fallback: ReactNode };

export function fallback(node: ReactNode): Fallback {
  return { ready: false, fallback: node };
}

export function useOpenBook(bookId: string): { ready: true; book: BookDetail } | Fallback {
  const { library } = useLibrarySession();
  const id = /^\d+$/.test(bookId) ? Number(bookId) : undefined;
  const book = useBook(library.isSuccess ? id : undefined);

  if (library.isError) return fallback(<StorageErrorScreen error={library.error} retry={() => void library.refetch()} />);
  if (!library.isSuccess) return fallback(<LoadingLibrary progress={library.progress} />);
  if (id === undefined) return fallback(<BookNotFound />);
  if (book.isError) return fallback(<StorageErrorScreen error={book.error} retry={() => void book.refetch()} />);
  if (book.data === null) return fallback(<BookNotFound />);
  if (!book.data) return fallback(null);
  return { ready: true, book: book.data };
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
