import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useConnection } from '../connection/context.tsx';
import { ConnectScreen, DisconnectedPage } from '../components/connect-screen.tsx';
import { ShortcutsHelp } from './_connected/-connected/shortcuts-help.tsx';

export const Route = createFileRoute('/_connected')({
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
