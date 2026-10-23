import type { BookDetail } from '../library/protocol.ts';
import { BookCover } from './book-cover.tsx';
import { BookDescription } from './book-description.tsx';
import { BookFields, BookTags } from './book-fields.tsx';
import { FormatList } from './format-list.tsx';

export function BookDetails({ book }: { book: BookDetail }) {
  return (
    <article className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="w-40 sm:sticky sm:top-18 sm:w-full sm:self-start">
        <BookCover book={book} loading="eager" />
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <header>
          <h1 className="text-3xl font-semibold break-words">{book.title}</h1>
          <p className="mt-1 text-lg text-neutral-700">{book.authors.join(' & ')}</p>
        </header>
        <div className="flex flex-col gap-3">
          <BookFields book={book} />
          <BookTags tags={book.tags} />
        </div>
        <FormatList book={book} />
        {book.description && <BookDescription html={book.description} />}
      </div>
    </article>
  );
}
