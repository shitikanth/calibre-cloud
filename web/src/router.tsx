import { Outlet, createRootRoute, createRoute, createRouter, type RouterHistory } from '@tanstack/react-router';
import { BookScreen } from './screens/book-screen.tsx';
import { ConnectLinkHandler } from './screens/connect-link.tsx';
import { ConnectProviderScreen } from './screens/connect-screen.tsx';
import { ConnectedGate } from './screens/connected-gate.tsx';
import { ConnectedShell } from './screens/connected-shell.tsx';
import { LibraryScreen } from './screens/library-screen.tsx';
import { ReaderScreen } from './screens/reader-screen.tsx';
import { SignInOutcomeHandler } from './screens/sign-in-outcome.tsx';

const rootRoute = createRootRoute({
  component: () => (
    <SignInOutcomeHandler>
      <ConnectLinkHandler>
        <Outlet />
      </ConnectLinkHandler>
    </SignInOutcomeHandler>
  ),
  notFoundComponent: () => <p>Page not found.</p>,
});

const connectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_connected',
  component: ConnectedGate,
});

const shellRoute = createRoute({
  getParentRoute: () => connectedRoute,
  id: '_shell',
  component: () => (
    <ConnectedShell>
      <Outlet />
    </ConnectedShell>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = search['q'];
    return typeof q === 'string' || typeof q === 'number' ? { q: String(q) } : {};
  },
  component: LibraryScreen,
});

const bookRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/books/$bookId',
  component: () => <BookScreen bookId={bookRoute.useParams().bookId} />,
});

const readerRoute = createRoute({
  getParentRoute: () => connectedRoute,
  path: '/books/$bookId/read/$format',
  component: () => <ReaderScreen {...readerRoute.useParams()} />,
});

const connectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/connect/$provider',
  component: () => <ConnectProviderScreen provider={connectRoute.useParams().provider} />,
});

const routeTree = rootRoute.addChildren([
  connectedRoute.addChildren([shellRoute.addChildren([homeRoute, bookRoute]), readerRoute]),
  connectRoute,
]);

export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({ routeTree, ...options });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
