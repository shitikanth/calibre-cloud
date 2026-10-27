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

type OpenBookProps = {
  bookId: string;
  frame?: (fallback: ReactNode) => ReactNode;
  children: (book: BookDetail) => ReactNode;
};

export function OpenBook({ bookId, frame = (fallback) => fallback, children }: OpenBookProps) {
  const { library } = useLibrarySession();

  if (library.isError) return frame(<StorageErrorScreen error={library.error} retry={() => void library.refetch()} />);
  if (!library.isSuccess) return frame(<LoadingLibrary progress={library.progress} />);
  if (!/^\d+$/.test(bookId)) return frame(<BookNotFound />);
  return (
    <LoadedBook id={Number(bookId)} frame={frame}>
      {children}
    </LoadedBook>
  );
}

function LoadedBook({ id, frame, children }: { id: number } & Required<Omit<OpenBookProps, 'bookId'>>) {
  const book = useBook(id);

  if (book.isError) return frame(<StorageErrorScreen error={book.error} retry={() => void book.refetch()} />);
  if (book.data === null) return frame(<BookNotFound />);
  if (!book.data) return null;
  return children(book.data);
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
