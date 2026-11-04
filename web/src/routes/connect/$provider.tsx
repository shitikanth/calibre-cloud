import { createFileRoute } from '@tanstack/react-router';
import { useProviders } from '../../connection/context.tsx';
import { useSignInProblem } from '../../components/sign-in-outcome.tsx';
import { ChooseProvider, ConnectCard, LinkStep } from './-connect/connect-screen.tsx';
import { LibraryPicker } from './-connect/library-picker.tsx';

export const Route = createFileRoute('/connect/$provider')({
  component: ConnectProviderRoute,
});

function ConnectProviderRoute() {
  const { provider: id } = Route.useParams();
  const { signInProvider, linkProvider } = useProviders();
  const problem = useSignInProblem();
  const signIn = signInProvider(id);
  if (signIn && !problem) return <LibraryPicker provider={signIn} />;
  const link = linkProvider(id);
  return <ConnectCard>{link ? <LinkStep provider={link} /> : <ChooseProvider />}</ConnectCard>;
}
