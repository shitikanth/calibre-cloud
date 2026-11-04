import { createFileRoute } from '@tanstack/react-router';
import { ChooseProvider, ConnectCard } from './-connect-screen.tsx';

export const Route = createFileRoute('/connect/')({
  component: () => (
    <ConnectCard>
      <ChooseProvider />
    </ConnectCard>
  ),
});
