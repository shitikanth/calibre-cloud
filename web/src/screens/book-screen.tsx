import { BookDetails } from './book-details.tsx';
import { LibraryNotices } from './library-notices.tsx';
import { useOpenBook } from './open-book.tsx';

export function BookScreen({ bookId }: { bookId: string }) {
  const opened = useOpenBook(bookId);
  if (!opened.ready) return opened.fallback;
  return (
    <div className="mx-auto max-w-6xl">
      <LibraryNotices />
      <BookDetails book={opened.book} />
    </div>
  );
}

