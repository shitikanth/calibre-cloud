import { createFileRoute } from '@tanstack/react-router';
import { BookDetails } from './-book/book-details.tsx';
import { LibraryNotices } from './-shell/library-notices.tsx';
import { useOpenBook } from '../-connected/open-book.tsx';

export const Route = createFileRoute('/_connected/_shell/books/$bookId')({
  component: BookRoute,
});

function BookRoute() {
  const { bookId } = Route.useParams();
  const opened = useOpenBook(bookId);
  if (!opened.ready) return opened.fallback;
  return (
    <div className="mx-auto max-w-6xl">
      <LibraryNotices />
      <BookDetails book={opened.book} />
    </div>
  );
}
