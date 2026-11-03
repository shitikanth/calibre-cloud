import { Link } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import type { BookSummary } from '../../../../library/protocol.ts';
import { useBooksById } from '../../../../library/use-book.ts';
import { listPositions, subscribePositions, type PositionEntry } from '../../../../reader/positions.ts';
import { BookCover } from '../-shell/book-cover.tsx';
import { tileColumnsClass, tileLinkClass } from './book-grid.tsx';
import { useRovingTiles, type RovingTiles } from './roving-tiles.ts';

const ROW_LENGTH = 6;

export function ContinueReading() {
  const positions = useSyncExternalStore(subscribePositions, listPositions);
  const books = useBooksById(positions.map(({ bookId }) => bookId));
  const cards = positions
    .flatMap((entry) => {
      const book = books.get(entry.bookId);
      return book ? [{ entry, book }] : [];
    })
    .slice(0, ROW_LENGTH);
  const roving = useRovingTiles(cards.map(({ entry }) => cardKey(entry)));
  if (cards.length === 0) return null;
  return (
    <section aria-label="Continue reading" className="mb-8">
      <h2 className="text-lg font-semibold">Continue reading</h2>
      <ul
        className={`-mx-4 mt-2 grid auto-cols-[minmax(min(9rem,calc(50%-0.5rem)),1fr)] grid-flow-col gap-4 overflow-x-auto px-4 pt-1 pb-2 sm:-mx-6 sm:px-6 ${tileColumnsClass}`}
        {...roving.listProps}
      >
        {cards.map(({ entry, book }) => (
          <li key={cardKey(entry)} className="min-w-0">
            <ContinueCard entry={entry} book={book} roving={roving} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function cardKey(entry: PositionEntry): string {
  return `${entry.bookId}/${entry.format}`;
}

function ContinueCard({ entry, book, roving }: Readonly<{ entry: PositionEntry; book: BookSummary; roving: RovingTiles }>) {
  return (
    <Link
      to="/books/$bookId/read/$format"
      params={{ bookId: String(book.id), format: entry.format }}
      className={tileLinkClass}
      {...roving.tileProps(cardKey(entry))}
    >
      <BookCover book={book} loading="lazy" />
      <h3 className="mt-2 line-clamp-2 text-sm font-medium break-words">{book.title}</h3>
      <p className="text-xs text-neutral-600">
        {entry.format} · {Math.round(entry.fraction * 100)}%
      </p>
    </Link>
  );
}
