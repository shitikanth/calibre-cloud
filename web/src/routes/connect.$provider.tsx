import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useConnection, useProviders } from '../connection/context.tsx';
import { ConnectScreen, DisconnectedPage } from '../components/connect-screen.tsx';
import { LibraryPicker } from './-connect/library-picker.tsx';
import { useSignInProblem } from '../components/sign-in-outcome.tsx';

export const Route = createFileRoute('/connect/$provider')({
  component: ConnectRoute,
});

function ConnectRoute() {
  const { provider: id } = Route.useParams();
  const { connection } = useConnection();
  const { signInProvider, linkProvider } = useProviders();
  const problem = useSignInProblem();
  if (connection) return <Navigate to="/" replace />;
  const signIn = signInProvider(id);
  return (
    <DisconnectedPage>
      {signIn && !problem ? <LibraryPicker provider={signIn} /> : <ConnectScreen provider={linkProvider(id)} />}
    </DisconnectedPage>
  );
}
