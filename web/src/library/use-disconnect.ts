import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
import { forgetBookFiles } from '../reader/book-cache.ts';
import { forgetAllPositions } from '../reader/positions.ts';
import { useLibraryIndex } from './context.tsx';
import { forgetCovers } from './cover-cache.ts';
import { saveStoredLibrary } from './stored-library.ts';

export function useDisconnect() {
  const { disconnect } = useConnection();
  const index = useLibraryIndex();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await forgetCovers();
      await forgetBookFiles();
      await index.clear();
    },
    onSuccess: () => {
      disconnect();
      saveStoredLibrary(undefined);
      forgetAllPositions();
      queryClient.removeQueries();
    },
  });
}

export type Disconnect = ReturnType<typeof useDisconnect>;
