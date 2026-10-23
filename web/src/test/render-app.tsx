import { createMemoryHistory } from '@tanstack/react-router';
import { render } from 'vitest-browser-react';
import { App } from '../app.tsx';
import { saveConnection, type Connection } from '../connection/connection.ts';
import { createAppRouter, type AppRouter } from '../router.tsx';
import type { StorageAdapter } from '../storage/adapter.ts';
import '../index.css';

export const testLink = 'https://mega.nz/folder/TestHandle#TestKey_123';

export type RenderAppOptions = { storage: StorageAdapter; path?: string; connected?: boolean };

export async function renderApp({ storage, path = '/', connected = false }: RenderAppOptions) {
  if (connected) saveConnection({ provider: 'mega', link: testLink });
  const opened: Connection[] = [];
  const openStorage = (connection: Connection) => {
    opened.push(connection);
    return storage;
  };
  let router: AppRouter;
  const mount = (at: string) => {
    router = createAppRouter({ history: createMemoryHistory({ initialEntries: [at] }) });
    return render(<App router={router} openStorage={openStorage} />);
  };

  let screen = await mount(path);
  return {
    get screen() {
      return screen;
    },
    opened,
    location: () => router.state.location.href,
    async reload() {
      const at = router.state.location.href;
      await screen.unmount();
      screen = await mount(at);
      return screen;
    },
  };
}
