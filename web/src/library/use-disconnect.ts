import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useConnection } from '../connection/context.tsx';
import { useLibraryIndex } from './context.tsx';
import { forgetCovers } from './cover-cache.ts';
import { saveStoredLibrary } from './stored-library.ts';

export function useDisconnect(): () => void {
  const { disconnect } = useConnection();
  const index = useLibraryIndex();
  const queryClient = useQueryClient();

  return useCallback(() => {
    disconnect();
    saveStoredLibrary(undefined);
    queryClient.removeQueries();
    void index.clear().catch(() => undefined);
    void forgetCovers();
  }, [disconnect, index, queryClient]);
}
