import { useQuery } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
import { useLibraryIndex } from './context.tsx';

export function useBook(bookId: number, enabled: boolean) {
  const index = useLibraryIndex();
  const { connection } = useConnection();
  return useQuery({
    queryKey: ['library', connection, 'book', bookId],
    enabled,
    queryFn: () => index.getBook(bookId),
  });
}
