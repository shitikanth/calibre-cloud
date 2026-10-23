import { Link } from '@tanstack/react-router';
import type { BookSummary } from '../library/protocol.ts';
import { BookCover } from './book-cover.tsx';

export function BookGrid({ books }: { books: BookSummary[] }) {
  return (
    <ul aria-label="Books" className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {books.map((book) => (
        <li key={book.id} className="min-w-0">
          <BookTile book={book} />
        </li>
      ))}
    </ul>
  );
}

function BookTile({ book }: { book: BookSummary }) {
  return (
    <Link to="/books/$bookId" params={{ bookId: String(book.id) }} className="block">
      <BookCover book={book} />
      <h2 className="mt-2 line-clamp-2 text-sm font-medium break-words">{book.title}</h2>
      <p className="line-clamp-2 text-xs text-neutral-600">{book.authors.join(' & ')}</p>
    </Link>
  );
}
