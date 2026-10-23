import { useQuery } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
import { useLibraryIndex } from './context.tsx';

export function useBook(bookId: number) {
  const index = useLibraryIndex();
  const { connection } = useConnection();
  return useQuery({
    queryKey: ['library', connection, 'book', bookId],
    queryFn: () => index.getBook(bookId),
  });
}
