import { Outlet, createFileRoute } from '@tanstack/react-router';
import { ConnectedShell } from './-shared/connected-shell.tsx';

export const Route = createFileRoute('/_connected/_shell')({
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <ConnectedShell>
      <Outlet />
    </ConnectedShell>
  );
}
