import { Navigate } from '@tanstack/react-router';
import { useConnection, useProviders } from '../connection/context.tsx';
import { ConnectScreen, DisconnectedPage } from './connect-screen.tsx';
import { LibraryPicker } from './library-picker.tsx';
import { useSignInProblem } from './sign-in-outcome.tsx';

export function ConnectProviderScreen({ provider: id }: { provider: string }) {
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
