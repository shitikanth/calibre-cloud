import { Outlet } from '@tanstack/react-router';
import { useConnection } from '../connection/context.tsx';
import { ConnectScreen, DisconnectedPage } from './connect-screen.tsx';
import { ShortcutsHelp } from './shortcuts-help.tsx';

export function ConnectedGate() {
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
