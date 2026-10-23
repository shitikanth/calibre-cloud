import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { useConnection } from './connection/context.tsx';
import { useLibrarySession } from './library/session.tsx';
import { AppBar } from './screens/app-bar.tsx';
import { BookScreen } from './screens/book-screen.tsx';
import { ConnectScreen } from './screens/connect-screen.tsx';
import { LibraryNotices } from './screens/library-notices.tsx';
import { LibraryScreen } from './screens/library-screen.tsx';

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <p>Page not found.</p>,
});

function RootLayout() {
  const { connection } = useConnection();
  return (
    <>
      {connection && <AppBar />}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {connection && <SessionNotices />}
        <Outlet />
      </main>
    </>
  );
}

function SessionNotices() {
  const { update } = useLibrarySession();
  return <LibraryNotices update={update} />;
}

type LibrarySearch = { q?: string };

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const q = search['q'];
    return typeof q === 'string' || typeof q === 'number' ? { q: String(q) } : {};
  },
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
