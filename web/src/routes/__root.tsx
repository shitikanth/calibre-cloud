import { Outlet, createRootRoute } from '@tanstack/react-router';
import { ConnectLinkHandler } from '../components/connect-link.tsx';
import { SignInOutcomeHandler } from '../components/sign-in-outcome.tsx';

export const Route = createRootRoute({
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
