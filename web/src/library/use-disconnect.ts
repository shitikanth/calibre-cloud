import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useConnection } from '../connection/context.tsx';
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
      await index.clear();
    },
    onSuccess: () => {
      disconnect();
      saveStoredLibrary(undefined);
      queryClient.removeQueries();
    },
  });
}

export type Disconnect = ReturnType<typeof useDisconnect>;
