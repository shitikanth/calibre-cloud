import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useConnection, useProviders } from '../connection/context.tsx';
import { forgetBookFiles } from '../reader/book-cache.ts';
import { forgetAllPositions } from '../reader/positions.ts';
import { useLibraryIndex } from './context.tsx';
import { forgetCovers } from './cover-cache.ts';
import { saveStoredLibrary } from './stored-library.ts';

export function useDisconnect() {
  const { connection, disconnect } = useConnection();
  const { endSignIn } = useProviders();
  const index = useLibraryIndex();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await forgetCovers();
      await forgetBookFiles();
      await index.clear();
      if (connection) await endSignIn(connection);
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
