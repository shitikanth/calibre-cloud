import { createFileRoute } from '@tanstack/react-router';
import { ConnectProviderScreen } from '../screens/connect-provider-screen.tsx';

export const Route = createFileRoute('/connect/$provider')({
  component: ConnectRoute,
});

function ConnectRoute() {
  const { provider } = Route.useParams();
  return <ConnectProviderScreen provider={provider} />;
}
