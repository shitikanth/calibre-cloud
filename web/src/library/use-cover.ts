import { useQuery } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
import { loadCover } from './cover-cache.ts';
import type { BookSummary } from './protocol.ts';

export function useCover(book: BookSummary, enabled: boolean) {
  const { connection, storage } = useConnection();
  const { cover } = book;
  return useQuery({
    queryKey: ['cover', connection, book.id, cover?.version],
    enabled: enabled && cover !== null && storage !== undefined,
    retry: false,
    staleTime: Infinity,
    queryFn: ({ signal }) => {
      if (!storage || !cover) throw new Error('No cover to load');
      return loadCover(storage, book.id, cover, signal);
    },
  });
}
