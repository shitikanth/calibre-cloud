import { useQuery } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
import type { BookSummary } from './protocol.ts';

export function useCover(book: BookSummary, enabled: boolean) {
  const { connection, storage } = useConnection();
  const { cover } = book;
  return useQuery({
    queryKey: ['library', connection, 'cover', book.id, cover?.version],
    enabled: enabled && cover !== null && storage !== undefined,
    retry: false,
    staleTime: Infinity,
    queryFn: ({ signal }) => {
      if (!storage || !cover) throw new Error('No cover to load');
      return storage.read(cover.path, { signal });
    },
  });
}
