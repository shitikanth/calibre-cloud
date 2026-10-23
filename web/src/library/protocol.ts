export type BookSummary = {
  id: number;
  title: string;
  authors: string[];
  cover: { path: string; version: string } | null;
};

export type CoverVersion = { bookId: number; version: string };

export type BookFormat = { format: string; size: number; path: string };

export type BookDetail = BookSummary & {
  series: { name: string; index: number } | null;
  tags: string[];
  publisher: string | null;
  languages: string[];
  published: string | null;
  description: string | null;
  formats: BookFormat[];
};

export type BookListQuery = { offset: number; limit: number; search?: string };

export type LibraryOperations = {
  open: { args: { bytes: ArrayBuffer }; result: string | null };
  openStored: { args: { file: string }; result: boolean };
  clear: { args: Record<string, never>; result: void };
  close: { args: Record<string, never>; result: void };
  countBooks: { args: Record<string, never>; result: number };
  listBooks: { args: BookListQuery; result: BookSummary[] };
  getBook: { args: { bookId: number }; result: BookDetail | null };
  listCoverVersions: { args: Record<string, never>; result: CoverVersion[] };
};

export type Operation = keyof LibraryOperations;

export type LibraryRequest = {
  [Op in Operation]: { id: number; op: Op } & LibraryOperations[Op]['args'];
}[Operation];

export type LibraryResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { name: string; message: string } };
