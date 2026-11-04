import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useConnection } from '../connection/context.tsx';
import { DisconnectedPage } from './connect/-connect/connect-screen.tsx';

export const Route = createFileRoute('/connect')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = search['redirect'];
    return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') ? { redirect } : {};
  },
  component: ConnectLayout,
});

function ConnectLayout() {
  const { connection } = useConnection();
  const { redirect = '/' } = Route.useSearch();
  const router = useRouter();

  useEffect(() => {
    if (connection) void router.navigate({ href: redirect, replace: true });
  }, [connection, redirect, router]);

  if (connection) return null;
  return (
    <DisconnectedPage>
      <Outlet />
    </DisconnectedPage>
  );
}
