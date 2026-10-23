import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { ConnectionProvider, type OpenStorage } from './connection/context.tsx';
import { LibraryIndexProvider } from './library/context.tsx';
import { LibrarySessionProvider } from './library/session.tsx';
import { RendererProvider } from './reader/context.tsx';
import type { Renderers } from './reader/renderer.ts';
import type { AppRouter } from './router.tsx';

export type AppProps = { router: AppRouter; openStorage: OpenStorage; renderers: Renderers };

export function App({ router, openStorage, renderers }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider openStorage={openStorage}>
        <LibraryIndexProvider>
          <LibrarySessionProvider>
            <RendererProvider renderers={renderers}>
              <RouterProvider router={router} />
            </RendererProvider>
          </LibrarySessionProvider>
        </LibraryIndexProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
