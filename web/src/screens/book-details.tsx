import type { BookDetail } from '../library/protocol.ts';
import { BookCover } from './book-cover.tsx';
import { BookDescription } from './book-description.tsx';
import { BookFields } from './book-fields.tsx';
import { FormatList } from './format-list.tsx';

export function BookDetails({ book }: { book: BookDetail }) {
  return (
    <article className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <div className="w-40 sm:w-full">
        <BookCover book={book} loading="eager" />
      </div>
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold break-words">{book.title}</h1>
        <p className="mt-1 text-lg text-neutral-700">{book.authors.join(' & ')}</p>
        <BookFields book={book} />
        <FormatList book={book} />
        {book.description && <BookDescription html={book.description} />}
      </div>
    </article>
  );
}
