import type { BookDetail, BookFormat } from './protocol.ts';
import type { Database } from './sqlite.ts';

const GET_BOOK = `
SELECT b.id, b.title, b.path, b.has_cover, b.last_modified, b.pubdate, b.series_index,
       (SELECT json_group_array(a.name ORDER BY bal.id)
          FROM books_authors_link bal JOIN authors a ON a.id = bal.author
         WHERE bal.book = b.id) AS authors,
       (SELECT s.name FROM books_series_link bsl JOIN series s ON s.id = bsl.series
         WHERE bsl.book = b.id) AS series,
       (SELECT json_group_array(t.name ORDER BY btl.id)
          FROM books_tags_link btl JOIN tags t ON t.id = btl.tag
         WHERE btl.book = b.id) AS tags,
       (SELECT p.name FROM books_publishers_link bpl JOIN publishers p ON p.id = bpl.publisher
         WHERE bpl.book = b.id) AS publisher,
       (SELECT json_group_array(l.lang_code ORDER BY bll.id)
          FROM books_languages_link bll JOIN languages l ON l.id = bll.lang_code
         WHERE bll.book = b.id) AS languages,
       (SELECT c.text FROM comments c WHERE c.book = b.id) AS description
  FROM books b
 WHERE b.id = ?`;

const GET_FORMATS = `
SELECT format, uncompressed_size, name FROM data WHERE book = ? ORDER BY format`;

type BookRow = {
  id: number;
  title: string;
  path: string;
  has_cover: number;
  last_modified: string;
  pubdate: string | null;
  series_index: number;
  authors: string;
  series: string | null;
  tags: string;
  publisher: string | null;
  languages: string;
  description: string | null;
};

type FormatRow = { format: string; uncompressed_size: number | string; name: string };

export function getBook(db: Database, bookId: number): BookDetail | null {
  const [row] = db.selectObjects(GET_BOOK, [bookId]) as BookRow[];
  if (!row) return null;
  const formats = db.selectObjects(GET_FORMATS, [bookId]) as FormatRow[];
  return {
    id: row.id,
    title: row.title,
    authors: JSON.parse(row.authors) as string[],
    cover: row.has_cover ? { path: `${row.path}/cover.jpg`, version: row.last_modified } : null,
    series: row.series === null ? null : { name: row.series, index: row.series_index },
    tags: JSON.parse(row.tags) as string[],
    publisher: row.publisher,
    languages: JSON.parse(row.languages) as string[],
    published: publishedDate(row.pubdate),
    description: row.description,
    formats: formats.map((format) => toFormat(row.path, format)),
  };
}

function toFormat(bookPath: string, { format, uncompressed_size, name }: FormatRow): BookFormat {
  return { format, size: Number(uncompressed_size), path: `${bookPath}/${name}.${format.toLowerCase()}` };
}

function publishedDate(pubdate: string | null): string | null {
  const date = /^(\d{4})-\d{2}-\d{2}/.exec(pubdate ?? '');
  if (!date || Number(date[1]) <= 101) return null;
  return date[0];
}
