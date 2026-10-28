import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { ConnectionProvider } from './connection/context.tsx';
import { LibraryIndexProvider } from './library/context.tsx';
import { LibrarySessionProvider } from './library/session.tsx';
import { RendererProvider } from './reader/context.tsx';
import type { Renderers } from './reader/renderer.ts';
import type { AppRouter } from './router.tsx';
import type { Providers } from './storage/providers.ts';

export type AppProps = { router: AppRouter; providers: Providers; renderers: Renderers };

export function App({ router, providers, renderers }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider providers={providers}>
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
