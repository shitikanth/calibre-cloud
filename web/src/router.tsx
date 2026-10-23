import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { useConnection } from './connection/context.tsx';
import { ConnectScreen } from './screens/connect-screen.tsx';
import { LibraryScreen } from './screens/library-screen.tsx';

const rootRoute = createRootRoute({
  component: () => (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Outlet />
    </main>
  ),
  notFoundComponent: () => <p>Page not found.</p>,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const q = search['q'];
    return typeof q === 'string' || typeof q === 'number' ? { q: String(q) } : {};
  },
  component: HomeScreen,
});

export type LibrarySearch = { q?: string };

function HomeScreen() {
  const { connection } = useConnection();
  return connection ? <LibraryScreen /> : <ConnectScreen />;
}

const routeTree = rootRoute.addChildren([homeRoute]);

export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({ routeTree, ...options });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
