import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useConnection } from '../connection/context.tsx';
import { ShortcutsHelp } from './_connected/-shared/shortcuts-help.tsx';

export const Route = createFileRoute('/_connected')({
  component: ConnectedGate,
});

function ConnectedGate() {
  const { connection } = useConnection();
  const router = useRouter();

  useEffect(() => {
    if (connection) return;
    const { href, pathname } = router.state.location;
    if (pathname.startsWith('/connect')) return;
    void router.navigate({ to: '/connect', search: href === '/' ? {} : { redirect: href }, replace: true });
  }, [connection, router]);

  if (!connection) return null;
  return (
    <ShortcutsHelp>
      <Outlet />
    </ShortcutsHelp>
  );
}
