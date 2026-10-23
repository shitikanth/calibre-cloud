import type { BookDetail } from '../library/protocol.ts';
import { formatDate, formatLanguage, formatSeriesIndex } from './format.ts';

export function BookFields({ book }: { book: BookDetail }) {
  const fields: [string, string | null][] = [
    ['Series', book.series && `Book ${formatSeriesIndex(book.series.index)} of ${book.series.name}`],
    ['Publisher', book.publisher],
    [book.languages.length > 1 ? 'Languages' : 'Language', book.languages.map(formatLanguage).join(', ') || null],
    ['Published', book.published && formatDate(book.published)],
  ];
  const shown = fields.filter((field): field is [string, string] => field[1] !== null);
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {shown.map(([name, value]) => (
        <Field key={name} name={name} value={value} />
      ))}
    </dl>
  );
}

function Field({ name, value }: { name: string; value: string }) {
  return (
    <>
      <dt className="text-neutral-600">{name}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}
