import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';

const rootRoute = createRootRoute({
  component: () => (
    <main className="mx-auto max-w-3xl p-6">
      <Outlet />
    </main>
  ),
  notFoundComponent: () => <p>Page not found.</p>,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <>
      <h1 className="text-3xl font-semibold">calibre-cloud</h1>
      <p className="mt-2 text-neutral-600">Browse your Calibre library from the cloud.</p>
    </>
  ),
});

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
