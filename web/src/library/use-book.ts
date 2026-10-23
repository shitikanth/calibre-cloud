import { useQuery } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
import { useLibraryIndex } from './context.tsx';
import type { BookSummary } from './protocol.ts';

export function useBook(bookId: number, enabled: boolean) {
  const index = useLibraryIndex();
  const { connection } = useConnection();
  return useQuery({
    queryKey: ['library', connection, 'book', bookId],
    enabled,
    queryFn: () => index.getBook(bookId),
  });
}

export function useDetailCover(book: BookSummary | null | undefined) {
  const { connection, storage } = useConnection();
  const cover = book?.cover;
  return useQuery({
    queryKey: ['library', connection, 'detail-cover', book?.id, cover?.version],
    enabled: cover != null && storage !== undefined,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: ({ signal }) => {
      if (!storage || !cover) throw new Error('No cover to load');
      return storage.read(cover.path, { signal });
    },
  });
}
