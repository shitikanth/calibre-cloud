import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useConnection } from '../connection/context.tsx';
import type { Connection } from '../connection/connection.ts';
import { useLibraryIndex } from './context.tsx';
import { updateLibrary } from './sync.ts';

function updateKey(connection: Connection | undefined) {
  return ['library-db', connection, 'update'];
}

export function useLibraryUpdate(checkOnLoad: boolean) {
  const { connection, storage } = useConnection();
  const index = useLibraryIndex();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: updateKey(connection),
    enabled: checkOnLoad,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async () => {
      if (!storage) throw new Error('Not connected');
      const updated = await updateLibrary(index, storage);
      if (!updated) return false;
      await queryClient.invalidateQueries({ queryKey: ['library', connection] });
      return true;
    },
  });
}

export type LibraryUpdate = ReturnType<typeof useLibraryUpdate>;

export function useDismissLibraryUpdate() {
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.setQueryData(updateKey(connection), false), [queryClient, connection]);
}
