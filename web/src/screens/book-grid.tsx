import { Link } from '@tanstack/react-router';
import type { BookSummary } from '../library/protocol.ts';
import { BookCover } from './book-cover.tsx';

export function BookGrid({ books }: { books: BookSummary[] }) {
  return (
    <ul aria-label="Books" className={`grid gap-x-4 gap-y-6 ${tileColumnsClass}`}>
      {books.map((book) => (
        <li key={book.id} className="min-w-0">
          <BookTile book={book} />
        </li>
      ))}
    </ul>
  );
}

export const tileColumnsClass = 'grid-cols-[repeat(auto-fill,minmax(min(9rem,calc(50%-0.5rem)),1fr))]';

export const tileLinkClass =
  'block rounded transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none';

function BookTile({ book }: { book: BookSummary }) {
  return (
    <Link to="/books/$bookId" params={{ bookId: String(book.id) }} className={tileLinkClass}>
      <BookCover book={book} loading="lazy" />
      <h2 className="mt-2 line-clamp-2 text-sm font-medium break-words">{book.title}</h2>
      <p className="line-clamp-2 text-xs text-neutral-600">{book.authors.join(' & ')}</p>
    </Link>
  );
}
