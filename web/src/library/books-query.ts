import type { BookSummary } from './protocol.ts';
import type { Database } from './sqlite.ts';

const LIST_BOOKS = `
SELECT b.id, b.title, b.path, b.has_cover, b.last_modified,
       (SELECT json_group_array(a.name ORDER BY bal.id)
          FROM books_authors_link bal JOIN authors a ON a.id = bal.author
         WHERE bal.book = b.id) AS authors
  FROM books b
 ORDER BY b.timestamp DESC, b.id DESC
 LIMIT ? OFFSET ?`;

type BookRow = { id: number; title: string; path: string; has_cover: number; last_modified: string; authors: string };

export function listBooks(db: Database, { offset, limit }: { offset: number; limit: number }): BookSummary[] {
  const rows = db.selectObjects(LIST_BOOKS, [limit, offset]) as BookRow[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    authors: JSON.parse(row.authors) as string[],
    cover: row.has_cover ? { path: `${row.path}/cover.jpg`, version: row.last_modified } : null,
  }));
}
