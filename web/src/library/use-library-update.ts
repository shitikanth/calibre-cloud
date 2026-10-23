import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
import { useLibraryIndex } from './context.tsx';
import { forgetStaleCovers } from './cover-cache.ts';
import { updateLibrary } from './sync.ts';

export function useLibraryUpdate(checkOnLoad: boolean) {
  const { connection, storage } = useConnection();
  const index = useLibraryIndex();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['library-db', connection, 'update'],
    enabled: checkOnLoad,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async () => {
      if (!storage) throw new Error('Not connected');
      const updated = await updateLibrary(index, storage);
      if (!updated) return false;
      await queryClient.invalidateQueries({ queryKey: ['library', connection] });
      await forgetStaleCovers(await index.listCoverVersions());
      return true;
    },
  });
}

export type LibraryUpdate = ReturnType<typeof useLibraryUpdate>;
