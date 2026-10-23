import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useConnection } from '../connection/context.tsx';
import { useLibraryIndex } from './context.tsx';
import { openLibrary } from './sync.ts';

export type DownloadProgress = { loaded: number; total: number };

export function useOpenLibrary() {
  const { connection, storage } = useConnection();
  const index = useLibraryIndex();
  const [progress, setProgress] = useState<DownloadProgress | undefined>();

  const query = useQuery({
    queryKey: ['library-db', connection],
    enabled: storage !== undefined,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: () => {
      if (!storage) throw new Error('Not connected');
      return openLibrary(index, storage, (loaded, total) => setProgress({ loaded, total }));
    },
  });
  return { ...query, progress };
}

const PAGE_SIZE = 60;

export function useBooks(enabled: boolean, search: string) {
  const index = useLibraryIndex();
  const { connection } = useConnection();
  return useInfiniteQuery({
    queryKey: ['library', connection, 'books', search],
    enabled,
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => index.listBooks({ offset: pageParam, limit: PAGE_SIZE, search }),
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastPage.length < PAGE_SIZE ? undefined : lastOffset + PAGE_SIZE,
    select: (data) => data.pages.flat(),
  });
}

export function useBookCount(enabled: boolean) {
  const index = useLibraryIndex();
  const { connection } = useConnection();
  return useQuery({
    queryKey: ['library', connection, 'count'],
    enabled,
    queryFn: () => index.countBooks(),
  });
}
