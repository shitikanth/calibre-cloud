import { useLocation } from '@tanstack/react-router';
import { useConnection, useProviders } from '../connection/context.tsx';

export function ReconnectLink({ className }: { className: string }) {
  const { connection } = useConnection();
  const { reconnectHref } = useProviders();
  const { pathname, searchStr } = useLocation();
  const href = connection && reconnectHref(connection, `${pathname}${searchStr}`);
  if (!href) return null;
  return (
    <a href={href} className={`${className} inline-flex min-h-11 items-center`}>
      Reconnect
    </a>
  );
}
