import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { ConnectionProvider, type OpenStorage } from './connection/context.tsx';
import { LibraryIndexProvider } from './library/context.tsx';
import { LibrarySessionProvider } from './library/session.tsx';
import type { AppRouter } from './router.tsx';

export function App({ router, openStorage }: { router: AppRouter; openStorage: OpenStorage }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider openStorage={openStorage}>
        <LibraryIndexProvider>
          <LibrarySessionProvider>
            <RouterProvider router={router} />
          </LibrarySessionProvider>
        </LibraryIndexProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
