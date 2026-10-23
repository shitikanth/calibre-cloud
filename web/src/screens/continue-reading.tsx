import { Link } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import type { BookSummary } from '../library/protocol.ts';
import { useBooksById } from '../library/use-book.ts';
import { listPositions, subscribePositions, type PositionEntry } from '../reader/positions.ts';
import { BookCover } from './book-cover.tsx';

const ROW_LENGTH = 6;

export function ContinueReading() {
  const positions = useSyncExternalStore(subscribePositions, listPositions).slice(0, ROW_LENGTH);
  const books = useBooksById(positions.map(({ bookId }) => bookId));
  const cards = positions.flatMap((entry) => {
    const book = books.get(entry.bookId);
    return book ? [{ entry, book }] : [];
  });
  if (cards.length === 0) return null;
  return (
    <section aria-label="Continue reading" className="mb-8">
      <h2 className="text-lg font-semibold">Continue reading</h2>
      <ul className="-mx-4 mt-3 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {cards.map(({ entry, book }) => (
          <li key={`${entry.bookId}/${entry.format}`} className="w-28 shrink-0 sm:w-32">
            <ContinueCard entry={entry} book={book} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContinueCard({ entry, book }: { entry: PositionEntry; book: BookSummary }) {
  return (
    <Link
      to="/books/$bookId/read/$format"
      params={{ bookId: String(book.id), format: entry.format }}
      className="block rounded transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none"
    >
      <BookCover book={book} loading="lazy" />
      <h3 className="mt-2 line-clamp-2 text-sm font-medium break-words">{book.title}</h3>
      <p className="text-xs text-neutral-600">
        {entry.format} · {Math.round(entry.fraction * 100)}%
      </p>
    </Link>
  );
}
