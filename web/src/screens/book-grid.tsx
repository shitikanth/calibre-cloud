import type { BookSummary } from '../library/protocol.ts';

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
    <article>
      {book.cover ? <div className="aspect-2/3 rounded bg-neutral-200" /> : <CoverPlaceholder title={book.title} />}
      <h2 className="mt-2 line-clamp-2 text-sm font-medium break-words">{book.title}</h2>
      <p className="line-clamp-2 text-xs text-neutral-600">{book.authors.join(' & ')}</p>
    </article>
  );
}

function CoverPlaceholder({ title }: { title: string }) {
  return (
    <div
      role="img"
      aria-label={`No cover for ${title}`}
      className="flex aspect-2/3 items-center justify-center overflow-hidden rounded bg-neutral-300 p-3 text-center font-serif text-neutral-700"
    >
      <span className="line-clamp-6 break-words">{title}</span>
    </div>
  );
}
