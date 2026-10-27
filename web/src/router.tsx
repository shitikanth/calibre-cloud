import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
  type RouterHistory,
} from '@tanstack/react-router';
import { useConnection } from './connection/context.tsx';
import { BookScreen } from './screens/book-screen.tsx';
import { ConnectLinkHandler } from './screens/connect-link.tsx';
import { ConnectScreen } from './screens/connect-screen.tsx';
import { ConnectedShell } from './screens/connected-shell.tsx';
import { LibraryScreen } from './screens/library-screen.tsx';
import { ReaderScreen } from './screens/reader-screen.tsx';

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <p>Page not found.</p>,
});

function RootLayout() {
  return (
    <ConnectLinkHandler>
      <Layout />
    </ConnectLinkHandler>
  );
}

function Layout() {
  const { connection } = useConnection();
  const reading = useMatch({ from: '/books/$bookId/read/$format', shouldThrow: false }) !== undefined;
  const library = useMatch({ from: '/', shouldThrow: false }) !== undefined;
  if (!connection) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    );
  }
  if (reading) return <Outlet />;
  return (
    <ConnectedShell wide={library}>
      <Outlet />
    </ConnectedShell>
  );
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

const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/books/$bookId/read/$format',
  component: ReaderRouteScreen,
});

function ReaderRouteScreen() {
  const { connection } = useConnection();
  const { bookId, format } = readerRoute.useParams();
  return connection ? <ReaderScreen bookId={bookId} format={format} /> : <ConnectScreen />;
}

const routeTree = rootRoute.addChildren([homeRoute, bookRoute, readerRoute]);

export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({ routeTree, ...options });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
