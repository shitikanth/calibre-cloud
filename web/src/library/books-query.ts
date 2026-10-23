import { BOOK_SUMMARY_COLUMNS, toBookSummary, type BookSummaryRow } from './book-summary-row.ts';
import type { BookFormatKey, BookListQuery, BookSummary, CoverVersion } from './protocol.ts';
import { fold } from './fold.ts';
import type { Database } from './sqlite.ts';

const LIST_BOOKS = `
SELECT ${BOOK_SUMMARY_COLUMNS}
  FROM books b
 WHERE $pattern IS NULL
    OR fold(b.title) LIKE $pattern ESCAPE '\\'
    OR EXISTS (SELECT 1 FROM books_authors_link bal JOIN authors a ON a.id = bal.author
                WHERE bal.book = b.id AND fold(replace(a.name, '|', ',')) LIKE $pattern ESCAPE '\\')
    OR EXISTS (SELECT 1 FROM books_series_link bsl JOIN series s ON s.id = bsl.series
                WHERE bsl.book = b.id AND fold(s.name) LIKE $pattern ESCAPE '\\')
    OR EXISTS (SELECT 1 FROM books_tags_link btl JOIN tags t ON t.id = btl.tag
                WHERE btl.book = b.id AND fold(t.name) LIKE $pattern ESCAPE '\\')
 ORDER BY b.timestamp DESC, b.id DESC
 LIMIT $limit OFFSET $offset`;

export function listBooks(db: Database, { offset, limit, search }: BookListQuery): BookSummary[] {
  const rows = db.selectObjects(LIST_BOOKS, { $pattern: likePattern(search), $limit: limit, $offset: offset });
  return (rows as BookSummaryRow[]).map(toBookSummary);
}

export function listCoverVersions(db: Database): CoverVersion[] {
  return db.selectObjects('SELECT id AS bookId, last_modified AS version FROM books WHERE has_cover') as CoverVersion[];
}

export function listBookFormats(db: Database): BookFormatKey[] {
  return db.selectObjects('SELECT book AS bookId, format FROM data') as BookFormatKey[];
}

function likePattern(search: string | undefined): string | null {
  const term = search?.trim();
  if (!term) return null;
  return `%${fold(term).replace(/[\\%_]/g, '\\$&')}%`;
}
