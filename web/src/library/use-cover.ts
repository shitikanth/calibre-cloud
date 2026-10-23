import { useQuery } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
import { loadCover } from './cover-cache.ts';
import type { BookSummary } from './protocol.ts';

export type CoverSize = 'thumbnail' | 'full';

export function useCover(book: BookSummary, size: CoverSize, enabled: boolean) {
  const { connection, storage } = useConnection();
  const { cover } = book;
  return useQuery({
    queryKey: ['cover', connection, size, book.id, cover?.version],
    enabled: enabled && cover !== null && storage !== undefined,
    retry: false,
    staleTime: Infinity,
    ...(size === 'full' && { gcTime: 0 }),
    queryFn: ({ signal }) => {
      if (!storage || !cover) throw new Error('No cover to load');
      return size === 'full' ? storage.read(cover.path, { signal }) : loadCover(storage, book.id, cover, signal);
    },
  });
}
