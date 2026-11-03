import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  useMatches,
  type RouterHistory,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useConnection, useProviders } from './connection/context.tsx';
import { BookScreen } from './screens/book-screen.tsx';
import { ConnectLinkHandler } from './screens/connect-link.tsx';
import { ConnectScreen } from './screens/connect-screen.tsx';
import { ConnectedShell } from './screens/connected-shell.tsx';
import { LibraryPicker } from './screens/library-picker.tsx';
import { LibraryScreen } from './screens/library-screen.tsx';
import { ReaderScreen, useReaderTarget } from './screens/reader-screen.tsx';
import { ShortcutsHelp } from './screens/shortcuts-help.tsx';
import { SignInOutcomeHandler, useSignInProblem } from './screens/sign-in-outcome.tsx';

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <p>Page not found.</p>,
});

function RootLayout() {
  return (
    <SignInOutcomeHandler>
      <ConnectLinkHandler>
        <Outlet />
      </ConnectLinkHandler>
    </SignInOutcomeHandler>
  );
}

function DisconnectedPage({ children }: { children: ReactNode }) {
  return (
    <div className="safe-area-padding">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

const connectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_connected',
  component: ConnectedGate,
});

function ConnectedGate() {
  const { connection } = useConnection();
  if (!connection) {
    return (
      <DisconnectedPage>
        <ConnectScreen />
      </DisconnectedPage>
    );
  }
  return (
    <ShortcutsHelp>
      <Outlet />
    </ShortcutsHelp>
  );
}

const shellRoute = createRoute({
  getParentRoute: () => connectedRoute,
  id: '_shell',
  component: ShellLayout,
});

function ShellLayout() {
  const wide = useMatches({ select: (matches) => matches.some((match) => match.staticData.wide === true) });
  return (
    <ConnectedShell wide={wide}>
      <Outlet />
    </ConnectedShell>
  );
}

type LibrarySearch = { q?: string };

const homeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  staticData: { wide: true },
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const q = search['q'];
    return typeof q === 'string' || typeof q === 'number' ? { q: String(q) } : {};
  },
  component: HomeRouteScreen,
});

function HomeRouteScreen() {
  const { q = '' } = homeRoute.useSearch();
  return <LibraryScreen search={q} />;
}

const bookRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/books/$bookId',
  component: BookRouteScreen,
});

function BookRouteScreen() {
  const { bookId } = bookRoute.useParams();
  return <BookScreen bookId={bookId} />;
}

const readerRoute = createRoute({
  getParentRoute: () => connectedRoute,
  path: '/books/$bookId/read/$format',
  component: ReaderRouteScreen,
});

function ReaderRouteScreen() {
  const { bookId, format } = readerRoute.useParams();
  const target = useReaderTarget(bookId, format);
  if (!target.ready) return <ConnectedShell>{target.fallback}</ConnectedShell>;
  return <ReaderScreen key={`${target.book.id}/${target.format.format}`} book={target.book} format={target.format} />;
}

const connectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/connect/$provider',
  component: ConnectRouteScreen,
});

function ConnectRouteScreen() {
  const { connection } = useConnection();
  const { signInProvider, linkProvider } = useProviders();
  const problem = useSignInProblem();
  const id = connectRoute.useParams().provider;
  if (connection) return <Navigate to="/" replace />;
  const signIn = signInProvider(id);
  return (
    <DisconnectedPage>
      {signIn && !problem ? <LibraryPicker provider={signIn} /> : <ConnectScreen provider={linkProvider(id)} />}
    </DisconnectedPage>
  );
}

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
  interface StaticDataRouteOption {
    wide?: boolean;
  }
}
