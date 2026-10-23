import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { useConnection } from './connection/context.tsx';
import { BookScreen } from './screens/book-screen.tsx';
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
  component: HomeScreen,
});

function HomeScreen() {
  const { connection } = useConnection();
  return connection ? <LibraryScreen /> : <ConnectScreen />;
}

const bookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/books/$bookId',
  component: BookRouteScreen,
});

function BookRouteScreen() {
  const { connection } = useConnection();
  const { bookId } = bookRoute.useParams();
  return connection ? <BookScreen bookId={bookId} /> : <ConnectScreen />;
}

const routeTree = rootRoute.addChildren([homeRoute, bookRoute]);

export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({ routeTree, ...options });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
