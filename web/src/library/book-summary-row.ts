import type { BookSummary } from './protocol.ts';

export const BOOK_SUMMARY_COLUMNS = `b.id, b.title, b.path, b.has_cover, b.last_modified,
       (SELECT json_group_array(a.name ORDER BY bal.id)
          FROM books_authors_link bal JOIN authors a ON a.id = bal.author
         WHERE bal.book = b.id) AS authors`;

export type BookSummaryRow = {
  id: number;
  title: string;
  path: string;
  has_cover: number;
  last_modified: string;
  authors: string;
};

function authorName(stored: string): string {
  return stored.replaceAll('|', ',');
}

export function toBookSummary(row: BookSummaryRow): BookSummary {
  return {
    id: row.id,
    title: row.title,
    authors: (JSON.parse(row.authors) as string[]).map(authorName),
    cover: row.has_cover ? { path: `${row.path}/cover.jpg`, version: row.last_modified } : null,
  };
}
