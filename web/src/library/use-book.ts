import { queryOptions, useQueries, useQuery } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
import type { Connection } from '../connection/connection.ts';
import { useLibraryIndex } from './context.tsx';
import type { LibraryIndex } from './library-index.ts';
import type { BookDetail } from './protocol.ts';

function bookQuery(index: LibraryIndex, connection: Connection | undefined, bookId: number) {
  return queryOptions({
    queryKey: ['library', connection, 'book', bookId],
    queryFn: () => index.getBook(bookId),
  });
}

export function useBook(bookId: number) {
  const index = useLibraryIndex();
  const { connection } = useConnection();
  return useQuery(bookQuery(index, connection, bookId));
}

export function useBooksById(bookIds: number[]): Map<number, BookDetail> {
  const index = useLibraryIndex();
  const { connection } = useConnection();
  const unique = [...new Set(bookIds)];
  return useQueries({
    queries: unique.map((bookId) => bookQuery(index, connection, bookId)),
    combine: (results) => new Map(results.flatMap(({ data }) => (data ? [[data.id, data] as const] : []))),
  });
}
